-- ═══════════════════════════════════════════════════════════════════════════
-- 00327 — document_state: Arrival Arc linkage (v11) + proposals.designer_client_id
--
-- Program: Arrival Arc (Wave 1). Rulings: DECISIONS.md R106 + I62–I66.
--
-- The Document surface is the `document_state` view — a UNION of four shapes:
--   A projects · B proposals · C leads · D designer_clients (status='lead').
-- Wave-1 wires the surface to the relationship spine so no-login households and
-- repeat clients stop reading as "Client" / 404. FIVE additive deltas:
--
--   (1) proposals gains `designer_client_id` — a no-login household has no
--       profile (client_id NULL); this links the proposal to the household the
--       designer already named in designer_clients (I62). Additive, nullable,
--       ON DELETE SET NULL.
--   (2) Shape B (proposal) client_name is RESCUED via designer_clients.client_name
--       through the new link — when client_id is NULL the profile name is NULL,
--       so we fall back to the household label instead of the 'Client' literal
--       (I62; the prod repro is Elena — proposal f9970369…, dc 5eed0104…).
--   (3) Shape C (lead) and Shape D (relationship) name coalesces now prefer
--       profiles.display_name over full_name (00289's precedent:
--       coalesce(nullif(btrim(display_name),''), full_name, …)). display_name is
--       guarded only — when it is NULL/blank the expression is byte-identical to
--       the prior body, so no existing row changes.
--   (4) Shape D emits `dc.lead_id AS lead_id` (was hardcoded null::uuid at 00236
--       line ~326). The accepted-lead → relationship linkage becomes visible so
--       the People lane can resolve /doc/{lead_id} to the relationship.
--   (5) Kody-ruled (I65): Shape D's project-pair exclusion
--       (NOT EXISTS projects for the designer/client pair — the repeat-client
--       404) is removed so a status='lead' relationship ALWAYS emits, even when
--       the pair already has a signed project. Shape D already filters
--       status='lead'; the proposal-chain (shape B) and open-lead (shape C)
--       exclusions are PRESERVED verbatim.
--
-- Head-body discipline (patina-db-migrations): the view body below is the
-- 00236 v10 definition copied VERBATIM (grep|sort|tail-1 winner among the nine
-- document_state migrations), with ONLY the four view deltas (2)–(5) grafted.
-- Every column, alias, and the four-shape UNION order are preserved — portal
-- code reads these columns by name. security_invoker stays true.
--
-- Lineage (document_state): 00191 → 00192 → 00195 → 00200 → 00202 → 00211 →
--   00219 → 00230 → 00236 → 00327 (this).
-- Lineage (begin_direction_from_discovery): 00224 → 00327 (this) — one added
--   INSERT column so a Discovery-seeded draft stamps designer_client_id.
--
-- Additive only (D7). No destructive change; old zones keep functioning.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (1) proposals gains the no-login-household relationship link (I62) ───────
alter table public.proposals
  add column if not exists designer_client_id uuid
    references public.designer_clients(id) on delete set null;

create index if not exists idx_proposals_designer_client
  on public.proposals(designer_client_id)
  where designer_client_id is not null;

comment on column public.proposals.designer_client_id is
  'I62 (Arrival Arc): links a proposal to the designer_clients household it was '
  'raised for. Load-bearing for no-login households — client_id is NULL (no '
  'profile), so document_state Shape B reads the client_name from this '
  'relationship instead of falling back to the "Client" literal. Additive, '
  'nullable, ON DELETE SET NULL (dropping the relationship must not delete the '
  'proposal). Stamped at creation by begin_direction_from_discovery.';

-- ── document_state v11 (00236 body verbatim + view deltas 2–5) ──────────────
create or replace view document_state
  with (security_invoker = true) as

-- ── Shape A: signed engagements ─────────────────────────────────────────────
select
  'project'::text                          as engagement_kind,
  p.id                                     as engagement_id,
  p.id                                     as project_id,
  null::uuid                               as proposal_id,
  null::uuid                               as lead_id,
  p.designer_id                            as designer_id,
  p.client_id                              as client_profile_id,
  coalesce(cp.full_name, 'Client')         as client_name,
  p.name                                   as title,
  p.status::text                           as project_status,
  p.current_phase                          as current_phase,
  case
    when p.status = 'completed'                                      then 'care'
    when p.current_phase in ('installation', 'final_walkthrough')    then 'install'
    else 'project'
  end                                      as active_section,
  (p.status = 'on_hold')                   as is_paused,
  (p.status = 'archived')                  as is_archived,
  null::text                               as proposal_status,
  null::timestamptz                        as proposal_sent_at,
  null::timestamptz                        as proposal_viewed_at,
  null::timestamptz                        as lead_response_deadline,
  null::text                               as lead_status,
  coalesce(d.overdue_decision_count, 0)    as overdue_decision_count,
  d.earliest_overdue_due                   as earliest_overdue_due,
  coalesce(f.awaiting_inspection_count, 0) as awaiting_inspection_count,
  coalesce(f.blocked_item_count, 0)        as blocked_item_count,
  coalesce(f.in_flight_count, 0)           as in_flight_count,
  coalesce(f.installed_count, 0)           as installed_count,
  coalesce(f.item_count, 0)                as item_count,
  p.updated_at                             as updated_at,
  coalesce(dmg.open_claim_count, 0)        as open_claim_count,
  dmg.open_claim_po                        as open_claim_po,
  coalesce(wp.unsent_pulse_count, 0)       as unsent_pulse_count,
  wp.pulse_week_of                         as pulse_week_of,
  coalesce(snd.draft_unsent_po_count, 0)   as draft_unsent_po_count,
  snd.oldest_draft_po_created_at           as oldest_draft_po_created_at,
  snd.draft_po_label                       as draft_po_label,
  coalesce(snd.unacked_po_count, 0)        as unacked_po_count,
  snd.oldest_unacked_sent_at               as oldest_unacked_sent_at,
  snd.unacked_po_label                     as unacked_po_label,
  coalesce(tk.due_task_count, 0)           as due_task_count,
  tk.earliest_task_due                     as earliest_task_due,
  tk.due_task_title                        as due_task_title,
  null::timestamptz                        as proposal_updated_at,
  -- Track 5 rollups (final two columns).
  coalesce(co.items_in_your_court, 0)      as items_in_your_court,
  coalesce(co.open_items_count, 0)         as open_items_count,
  0::bigint                                as proposal_open_count,
  null::timestamptz                        as proposal_last_opened_at
from projects p
left join profiles cp on cp.id = p.client_id
left join lateral (
  select
    count(*) filter (where cd.status = 'pending'
                       and cd.due_date is not null
                       and cd.due_date < now())  as overdue_decision_count,
    min(cd.due_date) filter (where cd.status = 'pending'
                               and cd.due_date is not null
                               and cd.due_date < now()) as earliest_overdue_due
  from client_decisions cd
  where cd.project_id = p.id
) d on true
left join lateral (
  select
    count(*) filter (where i.status = 'delivered'
                       and i.received_quantity is null) as awaiting_inspection_count,
    count(*) filter (where i.blocked)                   as blocked_item_count,
    count(*) filter (where i.status in ('ordered', 'production', 'shipped'))
                                                        as in_flight_count,
    count(*) filter (where i.status = 'installed')      as installed_count,
    count(*)                                            as item_count
  from project_ffe_items i
  where i.project_id = p.id
) f on true
left join lateral (
  select
    count(distinct dc2.id)                              as open_claim_count,
    min(coalesce(po.vendor_po_number, po.sidemark))     as open_claim_po
  from purchase_orders po
  join receiving_inspections ri on ri.purchase_order_id = po.id
                               and ri.outcome <> 'clean'
  join damage_claims dc2 on dc2.receiving_inspection_id = ri.id
                        and dc2.state in ('drafted', 'vendor_notified')
  where po.project_id = p.id
) dmg on true
left join lateral (
  select
    count(*)        as unsent_pulse_count,
    min(w.week_of)  as pulse_week_of
  from weekly_pulses w
  where w.project_id = p.id
    and w.status = 'draft'
    and w.week_of = date_trunc('week', now())::date
) wp on true
left join lateral (
  -- R18 need-line inputs: drafted POs never sent · sent POs the vendor has
  -- not acknowledged (delivered/cancelled POs need no chasing).
  select
    count(*) filter (where po2.status = 'draft'
                       and po2.sent_at is null)          as draft_unsent_po_count,
    min(po2.created_at) filter (where po2.status = 'draft'
                       and po2.sent_at is null)          as oldest_draft_po_created_at,
    (array_agg(coalesce(po2.po_number, po2.vendor_po_number, po2.sidemark)
       order by po2.created_at)
       filter (where po2.status = 'draft' and po2.sent_at is null))[1]
                                                         as draft_po_label,
    count(*) filter (where po2.sent_at is not null
                       and po2.acknowledged_at is null
                       and po2.status not in ('delivered', 'cancelled'))
                                                         as unacked_po_count,
    min(po2.sent_at) filter (where po2.sent_at is not null
                       and po2.acknowledged_at is null
                       and po2.status not in ('delivered', 'cancelled'))
                                                         as oldest_unacked_sent_at,
    (array_agg(coalesce(po2.po_number, po2.vendor_po_number, po2.sidemark)
       order by po2.sent_at)
       filter (where po2.sent_at is not null
                 and po2.acknowledged_at is null
                 and po2.status not in ('delivered', 'cancelled')))[1]
                                                         as unacked_po_label
  from purchase_orders po2
  where po2.project_id = p.id
) snd on true
left join lateral (
  -- R23: dued tasks pass the R22 action test (the act: do the task).
  -- Due TODAY counts — boundary semantics per the R10 contract.
  select
    count(*) filter (where t.status = 'todo'
                       and t.due_date is not null
                       and t.due_date <= current_date)   as due_task_count,
    min(t.due_date) filter (where t.status = 'todo'
                       and t.due_date is not null
                       and t.due_date <= current_date)   as earliest_task_due,
    (array_agg(t.title order by t.due_date)
       filter (where t.status = 'todo'
                 and t.due_date is not null
                 and t.due_date <= current_date))[1]     as due_task_title
  from project_tasks t
  where t.project_id = p.id
) tk on true
left join lateral (
  -- Track 5 court rollups: open coordination items in the designer's court, and
  -- the total open-item count, over the same client_decisions population.
  select
    count(*) filter (where cd.status = 'pending'
                       and cd.court = 'designer')        as items_in_your_court,
    count(*) filter (where cd.status = 'pending')        as open_items_count
  from client_decisions cd
  where cd.project_id = p.id
) co on true

union all

-- ── Shape B: pre-signing proposal chains ────────────────────────────────────
-- Live proposal = highest version in a chain that has not activated a project.
-- 'revised' siblings are superseded by definition; 'accepted' WITH a project
-- belongs to shape A via the project row. 'accepted' WITHOUT a project is the
-- signed-awaiting-activation moment — it stays here so the Desk can prompt
-- the designer to open the project (DECISIONS.md I7).
select
  'proposal'::text                         as engagement_kind,
  pr.chain_root_id                         as engagement_id,
  null::uuid                               as project_id,
  pr.id                                    as proposal_id,
  null::uuid                               as lead_id,
  pr.designer_id                           as designer_id,
  pr.client_id                             as client_profile_id,
  -- I62 (Arrival Arc, delta 2): rescue no-login households — when client_id is
  -- NULL the profile name is NULL, so fall back to the linked household label.
  coalesce(cp.full_name, dcb.client_name, 'Client') as client_name,
  coalesce(pr.title, 'Untitled proposal')  as title,
  null::text                               as project_status,
  null::text                               as current_phase,
  case when pr.status = 'draft' then 'direction' else 'proposal' end
                                           as active_section,
  false                                    as is_paused,
  false                                    as is_archived,
  pr.status                                as proposal_status,
  pr.sent_at                               as proposal_sent_at,
  pr.viewed_at                             as proposal_viewed_at,
  null::timestamptz                        as lead_response_deadline,
  null::text                               as lead_status,
  coalesce(d.overdue_decision_count, 0)    as overdue_decision_count,
  d.earliest_overdue_due                   as earliest_overdue_due,
  0::bigint                                as awaiting_inspection_count,
  0::bigint                                as blocked_item_count,
  0::bigint                                as in_flight_count,
  0::bigint                                as installed_count,
  0::bigint                                as item_count,
  pr.updated_at                            as updated_at,
  0::bigint                                as open_claim_count,
  null::text                               as open_claim_po,
  0::bigint                                as unsent_pulse_count,
  null::date                               as pulse_week_of,
  0::bigint                                as draft_unsent_po_count,
  null::timestamptz                        as oldest_draft_po_created_at,
  null::text                               as draft_po_label,
  0::bigint                                as unacked_po_count,
  null::timestamptz                        as oldest_unacked_sent_at,
  null::text                               as unacked_po_label,
  0::bigint                                as due_task_count,
  null::date                               as earliest_task_due,
  null::text                               as due_task_title,
  -- R45: when the live proposal (or any of its lines/sections) was last touched.
  -- The child rows belong to the live version pr.id (NOT the chain root).
  greatest(
    pr.updated_at,
    coalesce(
      (select max(updated_at) from proposal_items    where proposal_id = pr.id),
      'epoch'::timestamptz
    ),
    coalesce(
      (select max(updated_at) from proposal_sections where proposal_id = pr.id),
      'epoch'::timestamptz
    )
  )                                        as proposal_updated_at,
  -- Track 5 rollups: proposals carry no coordination items.
  0::bigint                                as items_in_your_court,
  0::bigint                                as open_items_count,
  (select count(*) from proposal_engagement pe
     where pe.proposal_id = pr.id and pe.event_type = 'opened')   as proposal_open_count,
  (select max(pe.created_at) from proposal_engagement pe
     where pe.proposal_id = pr.id and pe.event_type = 'opened')   as proposal_last_opened_at
from (
  select distinct on (coalesce(p2.parent_proposal_id, p2.id))
    coalesce(p2.parent_proposal_id, p2.id) as chain_root_id,
    p2.*
  from proposals p2
  where p2.project_id is null
    and p2.status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  order by coalesce(p2.parent_proposal_id, p2.id),
           p2.version desc nulls last,
           p2.created_at desc
) pr
left join profiles cp on cp.id = pr.client_id
-- I62 (Arrival Arc, delta 2): the no-login-household rescue link.
left join designer_clients dcb on dcb.id = pr.designer_client_id
left join lateral (
  select
    count(*) filter (where cd.status = 'pending'
                       and cd.due_date is not null
                       and cd.due_date < now())  as overdue_decision_count,
    min(cd.due_date) filter (where cd.status = 'pending'
                               and cd.due_date is not null
                               and cd.due_date < now()) as earliest_overdue_due
  from client_decisions cd
  where cd.linked_proposal_id in (pr.id, pr.chain_root_id)
) d on true

union all

-- ── Shape C: open leads (Brief active) ──────────────────────────────────────
select
  'lead'::text                             as engagement_kind,
  l.id                                     as engagement_id,
  null::uuid                               as project_id,
  null::uuid                               as proposal_id,
  l.id                                     as lead_id,
  l.designer_id                            as designer_id,
  l.homeowner_id                           as client_profile_id,
  -- Arrival Arc, delta 3: prefer display_name over full_name (00289 precedent).
  coalesce(nullif(btrim(cp.display_name), ''), cp.full_name, 'New client')
                                           as client_name,
  coalesce(initcap(replace(l.project_type, '_', ' ')), 'New inquiry')
                                           as title,
  null::text                               as project_status,
  null::text                               as current_phase,
  'brief'::text                            as active_section,
  false                                    as is_paused,
  false                                    as is_archived,
  null::text                               as proposal_status,
  null::timestamptz                        as proposal_sent_at,
  null::timestamptz                        as proposal_viewed_at,
  l.response_deadline                      as lead_response_deadline,
  l.status                                 as lead_status,
  0::bigint, null::timestamptz, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
  l.updated_at                             as updated_at,
  0::bigint                                as open_claim_count,
  null::text                               as open_claim_po,
  0::bigint                                as unsent_pulse_count,
  null::date                               as pulse_week_of,
  0::bigint                                as draft_unsent_po_count,
  null::timestamptz                        as oldest_draft_po_created_at,
  null::text                               as draft_po_label,
  0::bigint                                as unacked_po_count,
  null::timestamptz                        as oldest_unacked_sent_at,
  null::text                               as unacked_po_label,
  0::bigint                                as due_task_count,
  null::date                               as earliest_task_due,
  null::text                               as due_task_title,
  null::timestamptz                        as proposal_updated_at,
  -- Track 5 rollups: leads carry no coordination items.
  0::bigint                                as items_in_your_court,
  0::bigint                                as open_items_count,
  0::bigint                                as proposal_open_count,
  null::timestamptz                        as proposal_last_opened_at
from leads l
left join profiles cp on cp.id = l.homeowner_id
where l.designer_id is not null
  and l.status in ('new', 'viewed', 'contacted')

union all

-- ── Shape D: accepted relationship, pre-proposal (Discovery active) ─────────
select
  'relationship'::text                     as engagement_kind,
  dc.id                                    as engagement_id,
  null::uuid                               as project_id,
  null::uuid                               as proposal_id,
  -- Arrival Arc, delta 4: emit the accepted-lead linkage (was null::uuid).
  dc.lead_id                               as lead_id,
  dc.designer_id                           as designer_id,
  dc.client_id                             as client_profile_id,
  -- Arrival Arc, delta 3: household label wins, then display_name, then full_name.
  coalesce(dc.client_name,
           nullif(btrim(cp.display_name), ''),
           cp.full_name, 'New client')     as client_name,
  coalesce(dc.client_name,
           nullif(btrim(cp.display_name), ''),
           cp.full_name, 'New client')     as title,
  null::text, null::text,
  'discovery'::text                        as active_section,
  false, false,
  null::text, null::timestamptz, null::timestamptz,
  null::timestamptz, null::text,
  0::bigint, null::timestamptz, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
  dc.updated_at                            as updated_at,
  0::bigint                                as open_claim_count,
  null::text                               as open_claim_po,
  0::bigint                                as unsent_pulse_count,
  null::date                               as pulse_week_of,
  0::bigint                                as draft_unsent_po_count,
  null::timestamptz                        as oldest_draft_po_created_at,
  null::text                               as draft_po_label,
  0::bigint                                as unacked_po_count,
  null::timestamptz                        as oldest_unacked_sent_at,
  null::text                               as unacked_po_label,
  0::bigint                                as due_task_count,
  null::date                               as earliest_task_due,
  null::text                               as due_task_title,
  null::timestamptz                        as proposal_updated_at,
  -- Track 5 rollups: pre-proposal relationships carry no coordination items.
  0::bigint                                as items_in_your_court,
  0::bigint                                as open_items_count,
  0::bigint                                as proposal_open_count,
  null::timestamptz                        as proposal_last_opened_at
from designer_clients dc
left join profiles cp on cp.id = dc.client_id
where dc.status = 'lead'
  -- not already represented by a live proposal chain (shape B)
  and not exists (
    select 1 from proposals pp
    where pp.designer_id = dc.designer_id
      and pp.client_id = dc.client_id
      and pp.status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  )
  -- not already represented by an open lead (shape C)
  and not exists (
    select 1 from leads l2
    where l2.designer_id = dc.designer_id
      and l2.homeowner_id = dc.client_id
      and l2.status in ('new', 'viewed', 'contacted')
  );
  -- Arrival Arc, delta 5 (I65, Kody-ruled): the shape-A project-pair exclusion
  -- is REMOVED. A status='lead' relationship ALWAYS emits — a repeat client's
  -- new Discovery must not 404 just because an earlier signed project exists for
  -- the same designer/client pair. (They carry different engagement_ids: the
  -- project keys shape A on projects.id, this keys shape D on designer_clients.id.)

comment on view document_state is
  'The Document read model (R1 shapes A-D). v11 (00327, Arrival Arc): '
  'shape B client_name rescues no-login households via the new '
  'proposals.designer_client_id → designer_clients.client_name link (I62); '
  'shapes C and D prefer profiles.display_name over full_name (00289 precedent); '
  'shape D emits dc.lead_id and no longer excludes designer/client pairs that '
  'already have a project (I65 repeat-client 404 fix, Kody-ruled — status=lead '
  'always emits). Otherwise the 00236 v10 body verbatim (columns/order unchanged).';

-- Re-issue grants explicitly (idempotent; defends any column/owner edge case).
grant select on document_state to authenticated;
grant select on document_state to service_role;

-- ── begin_direction_from_discovery: stamp the seeded draft's household link ──
-- 00224 body VERBATIM except the one added INSERT column (designer_client_id):
-- a Discovery-seeded draft now carries its relationship link so document_state
-- Shape B can rescue the no-login household's name after the Shape D→B flip.
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
  --    Arrival Arc (I62): also stamp the household link so Shape B can rescue a
  --    no-login household's name post-flip.
  insert into proposals (designer_id, client_id, designer_client_id, title, status, description)
  values (
    v_dc.designer_id,
    v_dc.client_id,
    p_designer_client_id,
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
  'R66 readiness act: validates the five Discovery essentials, creates a seeded DRAFT proposal (scope rooms + style vision + budget), stamps the discovery row. Re-derives the engagement Discovery→Direction (document_state Shape D→B). Arrival Arc (I62): stamps proposals.designer_client_id so Shape B rescues no-login households. Idempotent.';
