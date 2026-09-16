-- ═══════════════════════════════════════════════════════════════════════════
-- 00590 — Engagement subject: an optional studio-written one-line subject
-- Lineage: document_state 00191 → 00192 → 00195 → 00200 → 00202 → 00211 →
--          00219 → 00230 → 00236 → 00327 → 00590
-- Reconciles: nothing reverted — 00327 is the head body, copied verbatim.
--
-- Ruling R4 of the Standing Head panel (10 September 2026): the letterhead
-- gains an optional studio-written one-line subject per engagement —
-- "Whole-house refresh · Beaverdale foursquare" instead of a derived label.
-- It is nullable and additive on all four engagement tables; NULL means the
-- portal assembles a line at read time from discovery facts (project type +
-- room count) — that assembled line is NEVER written back to this column.
-- subject is added to every leg of document_state (Shapes A-D) at the same
-- ordinal position: the last column, appended after proposal_last_opened_at.
--
-- Head-body discipline (patina-db-migrations): the view body below is the
-- 00327 v11 definition (the grep|sort|tail-1 winner among the document_state
-- migrations) copied VERBATIM, with ONLY the four `subject` columns grafted
-- in — one per leg, at the same ordinal position. Every other column, alias,
-- and the four-shape UNION order are preserved. security_invoker stays true.
-- The comment on view and the grants below are reissued VERBATIM from 00327
-- (its text does not mention subject — it still describes the v11/Arrival
-- Arc deltas; that is expected, not an omission).
--
-- Additive only. No destructive change; old zones keep functioning.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── subject: optional studio-written one-line engagement subject (R4) ───────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN public.projects.subject IS
  'Studio-written one-line subject for the Document head (R4, 2026-09-10). '
  'Null means the portal assembles a line at read time; the assembled line '
  'is never written here.';

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN public.proposals.subject IS
  'Studio-written one-line subject for the Document head (R4, 2026-09-10). '
  'Null means the portal assembles a line at read time; the assembled line '
  'is never written here.';

ALTER TABLE public.designer_clients ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN public.designer_clients.subject IS
  'Studio-written one-line subject for the Document head (R4, 2026-09-10). '
  'Null means the portal assembles a line at read time; the assembled line '
  'is never written here.';

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN public.leads.subject IS
  'Studio-written one-line subject for the Document head (R4, 2026-09-10). '
  'Null means the portal assembles a line at read time; the assembled line '
  'is never written here.';

-- ── document_state v12 (00327 v11 body verbatim + subject on every leg) ─────
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
  null::timestamptz                        as proposal_last_opened_at,
  p.subject                                as subject
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
     where pe.proposal_id = pr.id and pe.event_type = 'opened')   as proposal_last_opened_at,
  pr.subject                               as subject
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
  null::timestamptz                        as proposal_last_opened_at,
  l.subject                                as subject
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
  null::timestamptz                        as proposal_last_opened_at,
  dc.subject                               as subject
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

COMMIT;
