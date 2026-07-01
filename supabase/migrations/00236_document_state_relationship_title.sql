-- ═══════════════════════════════════════════════════════════════════════════
-- 00236 — document_state: the relationship branch takes the household's name (F8)
-- ═══════════════════════════════════════════════════════════════════════════
-- Walk 2026-07-01 finding F8: a no-login household (the R46/R62 normal case —
-- designer_clients.client_name set, profile absent) titled its Discovery
-- document "New client" because shape D read profiles.full_name only. The
-- relationship row already carries the name the designer gave it ("The
-- Marlowes"), so client_name and title now read
--   coalesce(dc.client_name, cp.full_name, 'New client')
-- in the relationship branch (shape D) ONLY — shapes A/B/C are untouched.
--
-- Additive only (D7): recreates the 00230 v9 body VERBATIM except those two
-- expressions. Every column, order, and the four-shape UNION are preserved.
-- security_invoker stays true — base-table RLS applies.
-- ═══════════════════════════════════════════════════════════════════════════

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
  coalesce(cp.full_name, 'Client')         as client_name,
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
  coalesce(cp.full_name, 'New client')     as client_name,
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
  null::uuid                               as lead_id,
  dc.designer_id                           as designer_id,
  dc.client_id                             as client_profile_id,
  coalesce(dc.client_name,
           cp.full_name, 'New client')     as client_name,
  coalesce(dc.client_name,
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
  )
  -- not already represented by a project (shape A)
  and not exists (
    select 1 from projects pj
    where pj.designer_id = dc.designer_id
      and pj.client_id = dc.client_id
  );

comment on view document_state is
  'The Document read model (R1 shapes A-D). v10 (00236): shape D (relationship) '
  'client_name/title now prefer designer_clients.client_name over the profile '
  'name (F8 - no-login households read as their household name, not New client). '
  'Otherwise the 00230 v9 definition verbatim (columns/order unchanged).';

-- Re-issue grants explicitly (idempotent; defends any column/owner edge case).
grant select on document_state to authenticated;
grant select on document_state to service_role;
