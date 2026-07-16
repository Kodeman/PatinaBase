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
--       through the new link. The household label wins FIRST (matching Shape D's
--       precedence so the displayed name never flips at the D→B transition),
--       then display_name, then full_name, then the 'Client' literal
--       (I62; the prod repro is Elena — proposal f9970369…, dc 5eed0104…).
--       Shape D's proposal-chain exclusion is correspondingly WIDENED with a
--       `pp.designer_client_id = dc.id` leg — the legacy pair join is never true
--       when dc.client_id is NULL, so a linked no-login household would
--       otherwise emit BOTH a Shape D and a Shape B doc (one household, two
--       Desk documents — the Elena duplicate).
--   (3) Shape C (lead) and Shape D (relationship) name coalesces now prefer
--       profiles.display_name over full_name (00289's precedent:
--       coalesce(nullif(btrim(display_name),''), full_name, …)). display_name is
--       guarded only — when it is NULL/blank the expression is byte-identical to
--       the prior body, so no existing row changes.
--   (4) Shape D emits `dc.lead_id AS lead_id` (was hardcoded null::uuid at 00236
--       line ~326). The accepted-lead → relationship linkage becomes visible so
--       the People lane can resolve /doc/{lead_id} to the relationship.
--   (5) Kody-ruled (I65): Shape D's project-pair exclusion (NOT EXISTS projects
--       for the designer/client pair — the repeat-client 404) is removed
--       ENTIRELY, AND the remaining two exclusions (proposal-chain/shape B,
--       open-lead/shape C) are re-scoped from PAIR to ENGAGEMENT. A lead-status
--       relationship is suppressed only by ITS OWN proposal (linked via
--       proposals.designer_client_id) or ITS OWN open lead (dc.lead_id), never by
--       any historical proposal / signed project / unrelated open lead that
--       merely shares the designer/client pair — so a repeat client's fresh
--       Discovery ALWAYS emits and never 404s the post-ceremony landing (the live
--       walk found the pair-scoped legs still suppressing every lead-status row
--       for a client with ANY prior proposal or open lead). The pair heuristic
--       survives ONLY as a legacy fallback for rows that predate the linkage
--       (dc.lead_id NULL; arc-born and 00285-era rows always carry lead_id).
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
-- Lineage (clone_proposal): 00176 → 00260 → 00264 → 00269 → 00327 (this) — one
--   added header-INSERT column so revising/duplicating a no-login household's
--   proposal carries designer_client_id (otherwise the revision's Desk doc
--   silently regresses to the 'Client' literal).
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
  -- I62 (Arrival Arc, delta 2): the designer's household label wins FIRST —
  -- matching Shape D's precedence, so a household's displayed name does NOT
  -- flip from dc.client_name to the profile name at the D→B transition. Then
  -- display_name over full_name (00289 precedent), then the literal.
  coalesce(dcb.client_name,
           nullif(btrim(cp.display_name), ''),
           cp.full_name, 'Client')       as client_name,
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
  -- Graduated to a proposal chain (shape B)? ENGAGEMENT-scoped (I65 fix): only
  -- THIS relationship's OWN proposal (linked by designer_client_id) suppresses
  -- it. A repeat client's earlier proposal for the same designer/client pair must
  -- NOT suppress a fresh Discovery relationship — that pair-scoped leg was the
  -- post-ceremony 404. Legacy rows (dc.lead_id NULL — the pre-linkage world where
  -- one pair = one engagement) keep the designer/client pair heuristic as a
  -- fallback. A no-login household has client_id NULL, so the pair leg is never
  -- true for it anyway; its designer_client_id link is the only thing that can
  -- suppress the otherwise-duplicate D+B pair.
  and not exists (
    select 1 from proposals pp
    where pp.status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
      and (pp.designer_client_id = dc.id
           or (dc.lead_id is null
               and pp.designer_id = dc.designer_id
               and pp.client_id = dc.client_id))
  )
  -- Still an open lead (shape C)? ENGAGEMENT-scoped (I65 fix): only the
  -- relationship's OWN lead being open suppresses it (it shows as the Brief
  -- instead). Another open lead for the same pair must NOT suppress it. Legacy
  -- fallback (dc.lead_id NULL) keeps the designer/homeowner pair heuristic.
  and not exists (
    select 1 from leads l2
    where l2.status in ('new', 'viewed', 'contacted')
      and (l2.id = dc.lead_id
           or (dc.lead_id is null
               and l2.designer_id = dc.designer_id
               and l2.homeowner_id = dc.client_id))
  );
  -- Arrival Arc, delta 5 (I65, Kody-ruled): the shape-A project-pair exclusion
  -- was REMOVED entirely, and the proposal-chain (shape B) + open-lead (shape C)
  -- exclusions above are now ENGAGEMENT-scoped (linked by designer_client_id /
  -- lead_id) rather than PAIR-scoped. A status='lead' relationship ALWAYS emits
  -- for a repeat client — a historical proposal, signed project, or unrelated
  -- open lead sharing the designer/client pair no longer 404s the fresh
  -- Discovery landing. (Each shape carries a distinct engagement_id: project keys
  -- shape A on projects.id, proposal keys shape B on the chain root, this keys
  -- shape D on designer_clients.id.) The pair heuristic survives ONLY for legacy
  -- rows that predate the linkage (dc.lead_id NULL — arc-born and 00285-era rows
  -- always carry lead_id).

comment on view document_state is
  'The Document read model (R1 shapes A-D). v11 (00327, Arrival Arc): '
  'shape B client_name rescues no-login households via the new '
  'proposals.designer_client_id → designer_clients.client_name link, household '
  'label FIRST to match shape D precedence (I62); shapes C and D prefer '
  'profiles.display_name over full_name (00289 precedent); shape D emits '
  'dc.lead_id. Shape D''s three exclusions are ENGAGEMENT-scoped (I65 '
  'repeat-client 404 fix, Kody-ruled): a lead-status relationship is suppressed '
  'only by its OWN proposal (designer_client_id leg — a linked household emits '
  'ONE doc, not a D+B pair) or its OWN open lead (dc.lead_id leg), never by a '
  'historical proposal / signed project / unrelated open lead that merely shares '
  'the designer/client pair — status=lead ALWAYS emits for repeat clients. The '
  'pair heuristic survives only as a legacy fallback for rows with dc.lead_id '
  'NULL. Otherwise the 00236 v10 body verbatim (columns/order unchanged).';

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

-- ── clone_proposal: carry the household link across revise/supersede ─────────
-- 00269 body VERBATIM (live head; lineage 00176 → 00260 → 00264 → 00269) except
-- ONE added header-INSERT column: designer_client_id rides along with the other
-- header fields, so revising or duplicating a no-login household's proposal
-- keeps the linkage — without it the new draft's document_state row would
-- silently regress from the household name to the 'Client' literal (I62).
CREATE OR REPLACE FUNCTION clone_proposal(
  p_source_id UUID,
  p_mode TEXT DEFAULT 'revision',
  p_revision_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source       proposals%ROWTYPE;
  v_new_id       UUID;
  v_root_id      UUID;
  v_room_map     JSONB := '{}'::jsonb;
  v_phase_map    JSONB := '{}'::jsonb;
  v_palette_map  JSONB := '{}'::jsonb;
  v_board_map    JSONB := '{}'::jsonb;
  v_room         RECORD;
  v_phase        RECORD;
  v_palette      RECORD;
  v_board        RECORD;
  v_new_child_id UUID;
BEGIN
  IF p_mode NOT IN ('revision', 'duplicate') THEN
    RAISE EXCEPTION 'clone_proposal: invalid mode %, expected revision|duplicate', p_mode;
  END IF;

  -- RLS-filtered read: returns nothing unless the caller can see the proposal.
  SELECT * INTO v_source FROM proposals WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clone_proposal: proposal % not found or access denied', p_source_id;
  END IF;

  v_root_id := COALESCE(v_source.parent_proposal_id, v_source.id);

  -- ── Header row (explicit columns; status/signing/sending state reset) ──
  -- Arrival Arc (I62): designer_client_id added to the carried columns.
  INSERT INTO proposals (
    designer_id, client_id, designer_client_id, project_id, template_id,
    title, description, project_address, cover_image,
    client_visibility_tier,
    subtotal, tax_rate, tax_amount, total_amount,
    discount_percent, discount_amount, deposit_percent,
    payment_terms, payment_notes,
    personal_message, cc_email, valid_until,
    status, version, parent_proposal_id,
    revision_summary, client_feedback,
    sent_at, viewed_at, accepted_at, declined_at, decline_reason,
    signed_at, signed_by_name, signed_ip
  )
  VALUES (
    v_source.designer_id,
    v_source.client_id,
    v_source.designer_client_id,
    NULL,                                  -- a fresh draft is never pre-linked to a project
    v_source.template_id,
    CASE WHEN p_mode = 'duplicate' THEN v_source.title || ' (Copy)' ELSE v_source.title END,
    v_source.description,
    v_source.project_address,
    v_source.cover_image,
    v_source.client_visibility_tier,
    v_source.subtotal, v_source.tax_rate, v_source.tax_amount, v_source.total_amount,
    v_source.discount_percent, v_source.discount_amount, v_source.deposit_percent,
    v_source.payment_terms, v_source.payment_notes,
    v_source.personal_message, v_source.cc_email, v_source.valid_until,
    'draft',
    CASE WHEN p_mode = 'revision' THEN COALESCE(v_source.version, 1) + 1 ELSE 1 END,
    CASE WHEN p_mode = 'revision' THEN v_root_id ELSE NULL END,
    CASE WHEN p_mode = 'revision' THEN p_revision_summary ELSE NULL END,
    CASE WHEN p_mode = 'revision' THEN v_source.client_feedback ELSE NULL END,
    NULL, NULL, NULL, NULL, NULL,          -- sent/viewed/accepted/declined/decline_reason
    NULL, NULL, NULL                       -- signed_at/signed_by_name/signed_ip
  )
  RETURNING id INTO v_new_id;

  -- ── Scope rooms (build old→new id map for items/palettes/boards remap) ──
  FOR v_room IN
    SELECT * FROM proposal_scope_rooms WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_scope_rooms (
      proposal_id, room_id, name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    )
    VALUES (
      v_new_id, v_room.room_id, v_room.name, v_room.room_type, v_room.dimensions,
      v_room.floor_area_sqft, v_room.budget_cents, v_room.ffe_categories,
      v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_room_map := v_room_map || jsonb_build_object(v_room.id::text, v_new_child_id::text);
  END LOOP;

  -- ── Phases (build old→new id map for deliverables/gates/milestones remap) ──
  FOR v_phase IN
    SELECT * FROM proposal_phases WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_phases (
      proposal_id, name, phase_key, duration_weeks, fee_cents,
      revision_limit, gate_condition, deliverables, sort_order
    )
    VALUES (
      v_new_id, v_phase.name, v_phase.phase_key, v_phase.duration_weeks,
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_child_id::text);
  END LOOP;

  -- ── Sections ──
  INSERT INTO proposal_sections (proposal_id, type, title, body, metadata, sort_order)
  SELECT v_new_id, type, title, body, metadata, sort_order
  FROM proposal_sections
  WHERE proposal_id = p_source_id;

  -- ── Items (remap scope_room_id) ──
  INSERT INTO proposal_items (
    proposal_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    vendor_id, vendor_name, lead_time_weeks, notes, internal_notes, position,
    item_type, scope_room_id, budget_min_cents, budget_max_cents, ffe_category, custom_fields
  )
  SELECT
    v_new_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    vendor_id, vendor_name, lead_time_weeks, notes, internal_notes, position,
    item_type,
    CASE WHEN scope_room_id IS NOT NULL AND v_room_map ? scope_room_id::text
         THEN (v_room_map ->> scope_room_id::text)::uuid
         ELSE NULL END,
    budget_min_cents, budget_max_cents, ffe_category, custom_fields
  FROM proposal_items
  WHERE proposal_id = p_source_id;

  -- ── Custom field DEFS (S6, 00268): deep-copy the source's schedule columns
  -- onto the new proposal (same field_key/name/kind/sort). The per-line VALUES
  -- ride along in proposal_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap. ──
  INSERT INTO spec_field_defs (proposal_id, field_key, name, kind, sort_order)
  SELECT v_new_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_source_id;

  -- ── Phase deliverables (remap phase_id, reset completion) ──
  INSERT INTO proposal_phase_deliverables (
    phase_id, label, description, is_required, completed_at, completed_by, sort_order
  )
  SELECT
    (v_phase_map ->> d.phase_id::text)::uuid,
    d.label, d.description, d.is_required, NULL, NULL, d.sort_order
  FROM proposal_phase_deliverables d
  JOIN proposal_phases ph ON ph.id = d.phase_id
  WHERE ph.proposal_id = p_source_id
    AND v_phase_map ? d.phase_id::text;

  -- ── Phase gates (remap phase_id, reset satisfaction) ──
  INSERT INTO proposal_phase_gates (
    phase_id, gate_kind, payload, satisfied_at, satisfied_by, override_reason, sort_order
  )
  SELECT
    (v_phase_map ->> g.phase_id::text)::uuid,
    g.gate_kind, g.payload, NULL, NULL, NULL, g.sort_order
  FROM proposal_phase_gates g
  JOIN proposal_phases ph ON ph.id = g.phase_id
  WHERE ph.proposal_id = p_source_id
    AND v_phase_map ? g.phase_id::text;

  -- ── Payment milestones (remap phase_id; phase_id is nullable) ──
  INSERT INTO proposal_payment_milestones (
    proposal_id, phase_id, label, percentage, amount_cents, trigger_condition, sort_order
  )
  SELECT
    v_new_id,
    CASE WHEN phase_id IS NOT NULL AND v_phase_map ? phase_id::text
         THEN (v_phase_map ->> phase_id::text)::uuid
         ELSE NULL END,
    label, percentage, amount_cents, trigger_condition, sort_order
  FROM proposal_payment_milestones
  WHERE proposal_id = p_source_id;

  -- ── Exclusions ──
  INSERT INTO proposal_exclusions (proposal_id, description, category, sort_order)
  SELECT v_new_id, description, category, sort_order
  FROM proposal_exclusions
  WHERE proposal_id = p_source_id;

  -- ── Change order terms (UNIQUE(proposal_id) — at most one row) ──
  INSERT INTO proposal_change_order_terms (
    proposal_id, process_description, hourly_rate_cents, minimum_fee_cents, approval_required
  )
  SELECT v_new_id, process_description, hourly_rate_cents, minimum_fee_cents, approval_required
  FROM proposal_change_order_terms
  WHERE proposal_id = p_source_id;

  -- ── Team members ──
  INSERT INTO proposal_team_members (proposal_id, user_id, role, permissions, sort_order)
  SELECT v_new_id, user_id, role, permissions, sort_order
  FROM proposal_team_members
  WHERE proposal_id = p_source_id
  ON CONFLICT (proposal_id, user_id, role) DO NOTHING;

  -- ── Palettes (build map, remap scope_room_id) then swatches ──
  FOR v_palette IN
    SELECT * FROM proposal_palettes WHERE proposal_id = p_source_id ORDER BY sort_order
  LOOP
    INSERT INTO proposal_palettes (
      proposal_id, name, scope_room_id, is_primary, source_image_url, notes, sort_order
    )
    VALUES (
      v_new_id, v_palette.name,
      CASE WHEN v_palette.scope_room_id IS NOT NULL AND v_room_map ? v_palette.scope_room_id::text
           THEN (v_room_map ->> v_palette.scope_room_id::text)::uuid
           ELSE NULL END,
      v_palette.is_primary, v_palette.source_image_url, v_palette.notes, v_palette.sort_order
    )
    RETURNING id INTO v_new_child_id;
    v_palette_map := v_palette_map || jsonb_build_object(v_palette.id::text, v_new_child_id::text);
  END LOOP;

  INSERT INTO palette_swatches (
    palette_id, hex, name, role, paint_color_id, brand, brand_code, source_pixel, sort_order
  )
  SELECT
    (v_palette_map ->> s.palette_id::text)::uuid,
    s.hex, s.name, s.role, s.paint_color_id, s.brand, s.brand_code, s.source_pixel, s.sort_order
  FROM palette_swatches s
  JOIN proposal_palettes pal ON pal.id = s.palette_id
  WHERE pal.proposal_id = p_source_id
    AND v_palette_map ? s.palette_id::text;

  -- ── Boards (build old→new id map, remap scope_room_id) then board items ──
  -- New in 00260. Ordered by (sort_order, created_at) to match useBoards.
  FOR v_board IN
    SELECT * FROM proposal_boards WHERE proposal_id = p_source_id ORDER BY sort_order, created_at
  LOOP
    INSERT INTO proposal_boards (
      proposal_id, name, scope_room_id, cover_image_url,
      canvas_width, canvas_height, background_color, sort_order,
      sections, status
    )
    VALUES (
      v_new_id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL AND v_room_map ? v_board.scope_room_id::text
           THEN (v_room_map ->> v_board.scope_room_id::text)::uuid
           ELSE NULL END,
      v_board.cover_image_url,
      v_board.canvas_width, v_board.canvas_height, v_board.background_color, v_board.sort_order,
      v_board.sections, v_board.status
    )
    RETURNING id INTO v_new_child_id;
    v_board_map := v_board_map || jsonb_build_object(v_board.id::text, v_new_child_id::text);
  END LOOP;

  -- Board items — copy geometry + snapshot verbatim; remap board_id (new board)
  -- and palette_id (cloned palettes). product_id and capture_id are kept (see
  -- the header note): the render uses the `data` snapshot, not those FKs. The
  -- item's data.section_id needs NO remap — the whole sections array is carried
  -- verbatim onto the new board, so its ids stay internally consistent.
  INSERT INTO proposal_board_items (
    board_id, type, x, y, width, height, z_index, rotation, locked,
    product_id, capture_id, palette_id, image_url, content, data
  )
  SELECT
    (v_board_map ->> bi.board_id::text)::uuid,
    bi.type, bi.x, bi.y, bi.width, bi.height, bi.z_index, bi.rotation, bi.locked,
    bi.product_id, bi.capture_id,
    CASE WHEN bi.palette_id IS NOT NULL AND v_palette_map ? bi.palette_id::text
         THEN (v_palette_map ->> bi.palette_id::text)::uuid
         ELSE NULL END,
    bi.image_url, bi.content, bi.data
  FROM proposal_board_items bi
  JOIN proposal_boards pb ON pb.id = bi.board_id
  WHERE pb.proposal_id = p_source_id
    AND v_board_map ? bi.board_id::text;

  -- NOT cloned (deliberate): proposal_captures (designer inbox tied to the
  -- original), proposal_engagement (per-version audit trail).

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION clone_proposal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clone_proposal(UUID, TEXT, TEXT) TO authenticated;
