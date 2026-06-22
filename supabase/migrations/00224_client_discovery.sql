-- ═══════════════════════════════════════════════════════════════════════════
-- 00224 — The Discovery section (The Document, Track 6, Slice 5 / R66)
--
-- Additive only (D7). The Discovery section is the seam between intake
-- (lead → Discovery, R61) and the proposal (Track 4). It captures the FIVE
-- STRUCTURED ESSENTIALS that auto-seed the proposal Drafting Room, plus the
-- unstructured margin Note and the folio at the Discovery stage.
--
-- Audit-first finding (R66): the five essentials have no structured home at
-- the Discovery stage. `leads` carries only coarse enum strings
-- (project_type / budget_range / timeline); the rich tables
-- (proposal_scope_rooms, …) live at the PROPOSAL stage — the seed TARGET, not
-- the capture surface. So this slice adds:
--   1. `client_discovery` — a 1:1 structured-capture table keyed to the
--      Discovery engagement (designer_clients.id, Shape D of document_state).
--   2. `begin_direction_from_discovery(designer_client_id)` — the readiness
--      act: validates the five essentials, creates a DRAFT proposal seeded
--      field→field, which re-derives the engagement Discovery→Direction
--      (document_state Shape D→B, 00211) and opens the Drafting Room pre-seeded.
--   3. A relationship key (`designer_client_id`) on `margin_notes` (R14) and
--      `project_documents` (the folio, R24) so the call's tone-Note and the
--      inspiration board work at Discovery — there is no project/proposal yet,
--      and both tables previously required one. The room scan plugs into the
--      existing `room_scans` (already designer-readable, 00014) — no new table.
--
-- The `document_state` view is NOT touched: Discovery is already Shape D
-- (active_section='discovery'); the seed flips it to Shape B mechanically.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. client_discovery — the structured-capture table ──────────────────────
create table if not exists client_discovery (
  id                  uuid primary key default gen_random_uuid(),
  designer_client_id  uuid not null unique
                        references designer_clients(id) on delete cascade,
  -- denormalized for the simplest RLS (mirrors designer_clients.designer_id)
  designer_id         uuid not null references profiles(id) on delete cascade,

  -- Essential 1 · Scope & rooms
  project_type        text,                            -- leads vocabulary: full_room | consultation | single_piece | staging
  rooms               jsonb not null default '[]',     -- [{name, room_type, floor_area_sqft, keep_as_is, notes}]

  -- Essential 2 · Budget (a comfort range, in cents per repo convention)
  budget_min_cents    integer,
  budget_max_cents    integer,
  budget_basis        text,                            -- all_in | furnishings_only | … (free text v1)

  -- Essential 3 · Timeline
  target_date         date,                            -- soft target (move-in)
  hard_date           date,                            -- hard deadline (the event)
  start_urgency       text,                            -- leads vocabulary: asap | 1_3_months | …

  -- Essential 4 · Style & inspiration
  style_tag_ids       uuid[] not null default '{}',    -- → styles.id (the global Aesthete vocabulary)
  style_keywords      text[] not null default '{}',    -- free descriptors ("warm minimal") not in the styles table

  -- Essential 5 · How they live (per-room lifestyle)
  lifestyle           jsonb not null default '[]',     -- [{room, who, how}]

  -- Deepening (structured-but-optional, never gating)
  keep_items          jsonb not null default '[]',     -- [{label, reason}]
  avoid_items         jsonb not null default '[]',     -- [{label}]
  decision_makers     jsonb not null default '[]',     -- [{name, role, approves, comms}]
  site_notes          text,                            -- ceilings / constraints (the scan itself stays in room_scans)
  room_scan_id        uuid references room_scans(id) on delete set null,

  -- Readiness + seed bookkeeping
  ready_at            timestamptz,                     -- stamped when the five essentials first complete
  seeded_proposal_id  uuid references proposals(id) on delete set null,
  seeded_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table client_discovery is
  'The Discovery section (R66, Track 6 Slice 5): the five STRUCTURED essentials + deepening, captured per Discovery engagement (designer_clients, Shape D). Structured on purpose — readiness is real and the data seeds the proposal field→field. The unstructured call tone lives in margin_notes, never here.';

create index if not exists idx_client_discovery_designer on client_discovery(designer_id);

create trigger update_client_discovery_updated_at
  before update on client_discovery
  for each row execute function update_updated_at_column();

alter table client_discovery enable row level security;

create policy client_discovery_designer_all on client_discovery
  for all to authenticated
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());

-- ── 2. margin_notes gains the relationship key (R14 at Discovery) ────────────
-- A Discovery engagement (Shape D) has neither project nor proposal, so the
-- Note — the margin's unstructured layer — needs a relationship anchor. The
-- author-scoped RLS (designer_id = auth.uid()) already covers it; only the
-- presence CHECK widens.
alter table margin_notes
  add column if not exists designer_client_id uuid
    references designer_clients(id) on delete cascade;

alter table margin_notes drop constraint if exists chk_margin_notes_engagement;
alter table margin_notes add constraint chk_margin_notes_engagement
  check (project_id is not null or proposal_id is not null or designer_client_id is not null);

create index if not exists idx_margin_notes_designer_client
  on margin_notes(designer_client_id) where designer_client_id is not null;

comment on column margin_notes.designer_client_id is
  'R66: anchors a Note to a pre-project Discovery engagement (designer_clients, Shape D), where project_id/proposal_id are both null. The margin holds only unstructured tone — structured discovery facts live in client_discovery.';

-- ── 3. project_documents (the folio, R24) gains the relationship key ─────────
-- The inspiration board clips into the folio at Discovery, before a project
-- exists. project_id was NOT NULL (00169); relax it additively and add the
-- relationship anchor. Files live under project-documents/{designer_client_id}/…
alter table project_documents
  add column if not exists designer_client_id uuid
    references designer_clients(id) on delete cascade;

alter table project_documents alter column project_id drop not null;

alter table project_documents drop constraint if exists chk_project_documents_owner;
alter table project_documents add constraint chk_project_documents_owner
  check (project_id is not null or designer_client_id is not null);

create index if not exists idx_project_documents_discovery
  on project_documents(designer_client_id, section_key)
  where designer_client_id is not null;

comment on column project_documents.designer_client_id is
  'R66: anchors a folio file (inspiration board, clipped scan) to a pre-project Discovery engagement (designer_clients, Shape D). Mutually exclusive-ish with project_id; the relationship leg of every read/write policy below scopes it to the owning designer.';

-- The designer read leg: a relationship folio file is visible to the engagement's designer.
drop policy if exists "Designers view discovery folio" on public.project_documents;
create policy "Designers view discovery folio"
  on public.project_documents for select to authenticated
  using (
    designer_client_id is not null
    and exists (
      select 1 from public.designer_clients dc
      where dc.id = project_documents.designer_client_id
        and dc.designer_id = auth.uid()
    )
  );

drop policy if exists "Designers manage discovery folio" on public.project_documents;
create policy "Designers manage discovery folio"
  on public.project_documents for all to authenticated
  using (
    designer_client_id is not null
    and exists (
      select 1 from public.designer_clients dc
      where dc.id = project_documents.designer_client_id
        and dc.designer_id = auth.uid()
    )
  )
  with check (
    designer_client_id is not null
    and exists (
      select 1 from public.designer_clients dc
      where dc.id = project_documents.designer_client_id
        and dc.designer_id = auth.uid()
    )
  );

-- Storage: the bucket gains the relationship leg (folder[1] = designer_client_id).
drop policy if exists "Designers manage discovery folio objects" on storage.objects;
create policy "Designers manage discovery folio objects"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.designer_clients dc
      where dc.id = ((storage.foldername(name))[1])::uuid
        and dc.designer_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.designer_clients dc
      where dc.id = ((storage.foldername(name))[1])::uuid
        and dc.designer_id = auth.uid()
    )
  );

-- ── 4. begin_direction_from_discovery — the readiness act + auto-seed ────────
-- Validates the five essentials, creates a DRAFT proposal seeded field→field
-- from the structured essentials, and stamps the discovery row. One
-- transaction (one-act-many-surfaces, spec §5). After it commits, the
-- engagement leaves document_state Shape D (a proposal now exists) and enters
-- Shape B with active_section='direction' (00211) — the Drafting Room doorway,
-- pre-seeded. Idempotent: a second call returns the same draft.
create or replace function begin_direction_from_discovery(p_designer_client_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_disc client_discovery%rowtype;
  v_dc   designer_clients%rowtype;
  v_prop uuid;
  v_room jsonb;
  v_sort int := 0;
begin
  -- RLS-filtered read: a designer can only touch their own engagement.
  select * into v_disc from client_discovery where designer_client_id = p_designer_client_id;
  if not found then
    raise exception 'discovery not found or access denied for %', p_designer_client_id;
  end if;

  -- Idempotency: already seeded → return the existing draft.
  if v_disc.seeded_proposal_id is not null then
    return v_disc.seeded_proposal_id;
  end if;

  -- The soft gate, server-enforced for the seed: the five essentials must be filled.
  if v_disc.project_type is null
     or jsonb_array_length(coalesce(v_disc.rooms, '[]'::jsonb)) = 0
     or v_disc.budget_max_cents is null
     or (v_disc.target_date is null and v_disc.hard_date is null)
     or (coalesce(array_length(v_disc.style_tag_ids, 1), 0) = 0
         and coalesce(array_length(v_disc.style_keywords, 1), 0) = 0)
     or jsonb_array_length(coalesce(v_disc.lifestyle, '[]'::jsonb)) = 0
  then
    raise exception 'discovery not ready: the five essentials must be captured';
  end if;

  select * into v_dc from designer_clients where id = p_designer_client_id;

  -- 1) The DRAFT proposal (the Shape D→B flip). Mirrors useCreateProposal's
  --    minimal insert (use-proposals.ts). version/total_amount take defaults.
  insert into proposals (designer_id, client_id, title, status, description)
  values (
    v_dc.designer_id,
    v_dc.client_id,
    coalesce(nullif(v_dc.client_name, ''), 'New proposal'),
    'draft',
    'Seeded from Discovery · budget '
      || coalesce(to_char(v_disc.budget_min_cents / 100, 'FM999,999,999'), '?')
      || '–'
      || coalesce(to_char(v_disc.budget_max_cents / 100, 'FM999,999,999'), '?')
  )
  returning id into v_prop;

  -- 2) Scope rooms, field→field from the discovery rooms[].
  for v_room in select * from jsonb_array_elements(v_disc.rooms) loop
    insert into proposal_scope_rooms
      (proposal_id, name, room_type, floor_area_sqft, budget_cents, notes, sort_order)
    values (
      v_prop,
      coalesce(nullif(v_room->>'name', ''), 'Room'),
      nullif(v_room->>'room_type', ''),
      nullif(v_room->>'floor_area_sqft', '')::numeric,
      0,  -- per-room budget is allocated in the Drafting Room
      nullif(
        concat_ws(' · ',
          case when coalesce((v_room->>'keep_as_is')::boolean, false) then 'Keep as-is' end,
          nullif(v_room->>'notes', '')),
        ''),
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  -- 3) Style read → a 'vision' narrative section (the Drafting Room Vision facet
  --    reads this; the designer fleshes it into palette/boards). metadata carries
  --    the structured tag ids for a future palette auto-build.
  insert into proposal_sections (proposal_id, type, title, body, metadata, sort_order)
  values (
    v_prop,
    'vision',
    'Style direction',
    nullif(array_to_string(v_disc.style_keywords, ' · '), ''),
    jsonb_build_object('style_tag_ids', to_jsonb(v_disc.style_tag_ids)),
    0
  );

  -- 4) Stamp the discovery row seeded (idempotency + provenance).
  update client_discovery
     set seeded_proposal_id = v_prop,
         seeded_at = now(),
         ready_at = coalesce(ready_at, now()),
         updated_at = now()
   where id = v_disc.id;

  return v_prop;
end;
$$;

revoke all on function begin_direction_from_discovery(uuid) from public;
grant execute on function begin_direction_from_discovery(uuid) to authenticated;

comment on function begin_direction_from_discovery(uuid) is
  'R66 readiness act: validates the five Discovery essentials, creates a seeded DRAFT proposal (scope rooms + style vision + budget), stamps the discovery row. Re-derives the engagement Discovery→Direction (document_state Shape D→B). Idempotent.';
