-- ═══════════════════════════════════════════════════════════════════════════
-- 00219 — coordination read models + view enrichment (Track 5)
--
-- The coordination surfaces are READ MODELS over client_decisions / project_tasks
-- (+ the additive Track-5 columns). Nothing here is stored state — it all
-- recomputes on read, so a single resolve_coordination_item (00218) is truthful
-- on every surface at once (one-act-many-surfaces).
--
-- 1. coordination_court_summary — per-project, per-court open/overdue/next-due
--    counts (the court bar's "In your court · N", overdue dot, next-due hint).
-- 2. task_blocked_state — per-task derived effective-blocked: an open coordination
--    blocker AND/OR an unfinished trade-sequence predecessor. (Derived, never
--    stored — project_tasks.status stays todo|done|blocked; this is the truth the
--    ⊘ tick reads.)
-- 3. margin_items — CREATE OR REPLACE the 00206 body VERBATIM, only ENRICHING the
--    decision branch payload with coordination_kind + court (new items appear for
--    free — the existing status filter pending|responded|expired already includes
--    the new kinds).
-- 4. document_state — CREATE OR REPLACE the 00211 body, APPENDING two rollup
--    columns to EVERY shape: items_in_your_court (pending, court='designer') and
--    open_items_count (pending). Shapes B/C/D carry 0::bigint to keep arity aligned.
--
-- Additive only (D7): both views are security_invoker; every existing column,
-- order, and the four-shape UNION are preserved — only enrichments/appends.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. coordination_court_summary — per-project per-court rollup
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.coordination_court_summary
  WITH (security_invoker = true) AS
SELECT
  cd.project_id                                                   AS project_id,
  cd.court                                                        AS court,
  count(*) FILTER (WHERE cd.status = 'pending')                   AS open_count,
  count(*) FILTER (WHERE cd.status = 'pending'
                     AND cd.due_date IS NOT NULL
                     AND cd.due_date < now())                     AS overdue_count,
  min(cd.due_date) FILTER (WHERE cd.status = 'pending')           AS next_due
FROM public.client_decisions cd
WHERE cd.project_id IS NOT NULL
GROUP BY cd.project_id, cd.court;

COMMENT ON VIEW public.coordination_court_summary IS
  'Track 5: per-project per-court open-item rollup (open_count, overdue_count, '
  'next_due) over client_decisions. Powers the court bar pills. SECURITY INVOKER '
  '— base-table RLS applies.';

GRANT SELECT ON public.coordination_court_summary TO authenticated;
GRANT SELECT ON public.coordination_court_summary TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. task_blocked_state — derived effective-blocked per task
-- ═══════════════════════════════════════════════════════════════════════════
-- blocked_by_open_item : a coordination item gates it AND that item is still
--                        pending (a resolved item no longer blocks).
-- blocked_by_sequence  : it sequences after a task that is NOT done yet.
-- The ⊘ tick reads this; the row carries the blocker's id + court (so clicking
-- the tick opens that item's sheet) and the waiting-on task id.
CREATE OR REPLACE VIEW public.task_blocked_state
  WITH (security_invoker = true) AS
SELECT
  t.id                                            AS task_id,
  t.project_id                                    AS project_id,
  (bi.id IS NOT NULL AND bi.status = 'pending')   AS blocked_by_open_item,
  (pre.id IS NOT NULL AND pre.status <> 'done')   AS blocked_by_sequence,
  bi.id                                           AS blocking_item_id,
  bi.court                                        AS blocking_item_court,
  pre.id                                          AS waiting_on_task_id
FROM public.project_tasks t
LEFT JOIN public.client_decisions bi ON bi.id = t.blocked_by_item_id
LEFT JOIN public.project_tasks    pre ON pre.id = t.seq_after_task_id;

COMMENT ON VIEW public.task_blocked_state IS
  'Track 5: derived effective-blocked per project_task — blocked_by_open_item (a '
  'still-pending coordination blocker) and/or blocked_by_sequence (an unfinished '
  'seq_after predecessor), with the blocking item''s id + court and the waiting-on '
  'task id. Read-side truth for the ⊘ tick; nothing is stored. SECURITY INVOKER.';

GRANT SELECT ON public.task_blocked_state TO authenticated;
GRANT SELECT ON public.task_blocked_state TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. margin_items — recreate the 00206 body VERBATIM + enrich the decision
--    branch payload with coordination_kind + court (Track 5).
--    Every other branch (message / invoice / pulse / time / note / vendor-payment)
--    is byte-for-byte 00206. New coordination items surface for free: the
--    decision branch's status filter (pending|responded|expired) already admits
--    rfi/submittal/signoff/punch rows.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view margin_items
  with (security_invoker = true) as

-- ── decision ────────────────────────────────────────────────────────────────
select
  'decision'::text                          as kind,
  cd.id                                     as item_id,
  cd.project_id                             as project_id,
  cd.linked_proposal_id                     as proposal_id,
  case
    when li.line_id is not null then 'line'
    when cd.section_key is not null then 'section'
    else 'letterhead'
  end                                       as anchor_kind,
  li.line_id                                as anchor_id,
  case
    when cd.status = 'pending' and cd.due_date is not null and cd.due_date < now()
      then 'overdue'
    else cd.status
  end                                       as state,
  cd.title                                  as title,
  coalesce(cd.context, '')                  as detail,
  coalesce(cd.due_date, cd.updated_at)      as ts,
  jsonb_build_object(
    'due_date', cd.due_date,
    'blocking_status', cd.blocking_status,
    'reminder_sent_at', cd.reminder_sent_at,
    'responded_at', cd.responded_at,
    'decision_kind', cd.decision_kind,
    'section_key', cd.section_key,
    -- Track 5: the workflow shape + ball-in-court for the coordination grammar.
    'coordination_kind', cd.coordination_kind,
    'court', cd.court
  )                                         as payload
from client_decisions cd
left join lateral (
  select i.id as line_id
  from project_ffe_items i
  where i.blocked_by_decision_id = cd.id or i.source_decision_id = cd.id
  order by (i.blocked_by_decision_id = cd.id) desc, i.sort_order
  limit 1
) li on true
where cd.status in ('pending', 'responded', 'expired')

union all

-- ── message (one row per anchored thread) ───────────────────────────────────
-- F1/F6: the lateral resolves the latest message's sender; own_voice marks
-- studio-authored threads (pre-settled, excluded from unread derivation).
select
  'message'::text                           as kind,
  t.id                                      as item_id,
  t.project_id                              as project_id,
  t.proposal_id                             as proposal_id,
  coalesce(t.anchor_kind, 'letterhead')     as anchor_kind,
  t.anchor_id                               as anchor_id,
  case
    when m.own_voice then 'read'
    when exists (
      select 1 from comms_thread_participants tp
      where tp.thread_id = t.id
        and tp.profile_id = auth.uid()
        and (tp.last_read_at is null or tp.last_read_at < t.last_message_at)
    ) then 'unread'
    else 'read'
  end                                       as state,
  coalesce(t.title, 'Conversation')         as title,
  coalesce(m.snippet, '')                   as detail,
  t.last_message_at                         as ts,
  jsonb_build_object(
    'thread_kind', t.kind,
    'sender_name', m.sender_name,
    'own_voice', m.own_voice
  )                                         as payload
from comms_threads t
left join projects  mpj on mpj.id = t.project_id
left join proposals mpp on mpp.id = t.proposal_id
left join lateral (
  select
    left(cm.body, 140) as snippet,
    -- A studio-authored message is any latest post NOT from a client/vendor
    -- participant; system messages (sender null) are the studio's voice.
    (cm.sender_id is null or not exists (
      select 1 from comms_thread_participants sp
      where sp.thread_id = t.id
        and sp.profile_id = cm.sender_id
        and sp.role in ('client', 'vendor')
    )) as own_voice,
    case
      when cm.sender_id is null or not exists (
        select 1 from comms_thread_participants sp
        where sp.thread_id = t.id
          and sp.profile_id = cm.sender_id
          and sp.role in ('client', 'vendor')
      )
      -- Studio side: display name, else the studio's own name (R16 → senders).
      then coalesce(nullif(btrim(p.full_name), ''), st.studio_name)
      -- Client/vendor side: display name or nothing — never a substitute.
      else nullif(btrim(p.full_name), '')
    end as sender_name
  from comms_messages cm
  left join profiles p on p.id = cm.sender_id
  left join lateral (
    select o.name as studio_name
    from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = coalesce(mpj.designer_id, mpp.designer_id)
      and om.status = 'active'
      and o.type = 'design_studio'
    order by om.created_at
    limit 1
  ) st on true
  where cm.thread_id = t.id and cm.deleted_at is null
  order by cm.created_at desc
  limit 1
) m on true
where t.kind in ('direct', 'project', 'vendor_brief')
  and (t.project_id is not null or t.proposal_id is not null)
  and t.last_message_at is not null

union all

-- ── invoice ─────────────────────────────────────────────────────────────────
select
  'invoice'::text                           as kind,
  inv.id                                    as item_id,
  inv.project_id                            as project_id,
  null::uuid                                as proposal_id,
  case when fl.ffe_item_id is not null then 'line' else 'letterhead' end
                                            as anchor_kind,
  fl.ffe_item_id                            as anchor_id,
  inv.status                                as state,
  case
    when inv.invoice_number is not null then inv.invoice_number
    else 'Draft invoice'
  end                                       as title,
  coalesce(inv.memo, '')                    as detail,
  inv.updated_at                            as ts,
  jsonb_build_object(
    'invoice_number', inv.invoice_number,
    'total_cents', inv.total_cents,
    'due_date', inv.due_date,
    'sent_at', inv.sent_at
  )                                         as payload
from invoices inv
left join lateral (
  select l.ffe_item_id
  from invoice_line_items l
  where l.invoice_id = inv.id and l.ffe_item_id is not null
  order by l.sort_order
  limit 1
) fl on true
where inv.status in ('draft', 'sent', 'partially_paid')

union all

-- ── pulse ───────────────────────────────────────────────────────────────────
select
  'pulse'::text                             as kind,
  wp.id                                     as item_id,
  wp.project_id                             as project_id,
  null::uuid                                as proposal_id,
  wp.anchor_kind                            as anchor_kind,
  wp.anchor_id                              as anchor_id,
  case
    when wp.status = 'draft' and wp.week_of = date_trunc('week', now())::date
      then 'due'
    else wp.status
  end                                       as state,
  coalesce(wp.subject, 'Weekly Pulse')      as title,
  coalesce(wp.body, '')                     as detail,
  coalesce(wp.sent_at, wp.week_of::timestamptz) as ts,
  jsonb_build_object(
    'week_of', wp.week_of,
    'sent_at', wp.sent_at
  )                                         as payload
from weekly_pulses wp

union all

-- ── time (daily summary — a query, not a table; spec §5) ────────────────────
select
  'time'::text                              as kind,
  -- deterministic synthetic id: one margin item per project-day
  uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    te.project_id::text || te.day::text
  )                                         as item_id,
  te.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'logged'::text                            as state,
  'Time · ' || to_char(te.day, 'Mon FMDD')  as title,
  ''::text                                  as detail,
  te.day::timestamptz                       as ts,
  jsonb_build_object(
    'minutes', te.minutes,
    'entry_count', te.entry_count,
    'day', te.day
  )                                         as payload
from (
  select
    pte.project_id,
    date(pte.started_at) as day,
    sum(pte.duration_minutes) as minutes,
    count(*) as entry_count
  from project_time_entries pte
  where pte.duration_minutes is not null
    and pte.started_at > now() - interval '7 days'
  group by pte.project_id, date(pte.started_at)
) te
union all

-- ── note (R14 — designer-authored marginalia; studio-only via RLS) ──────────
select
  'note'::text                              as kind,
  n.id                                      as item_id,
  n.project_id                              as project_id,
  n.proposal_id                             as proposal_id,
  n.anchor_kind                             as anchor_kind,
  n.anchor_id                               as anchor_id,
  case
    when n.escalated_to_decision_id is not null
      or n.escalated_to_scope_change_id is not null      then 'escalated'
    when n.due_date is not null and n.due_date <= now()  then 'due'
    else 'open'
  end                                       as state,
  left(n.body, 80)                          as title,
  ''::text                                  as detail,
  coalesce(n.due_date, n.updated_at)        as ts,
  jsonb_build_object(
    'due_date', n.due_date,
    'escalated_to_decision_id', n.escalated_to_decision_id,
    'escalated_to_scope_change_id', n.escalated_to_scope_change_id,
    'author_name', ap.full_name
  )                                         as payload
from margin_notes n
left join profiles ap on ap.id = n.designer_id

union all

-- ── vendor payment due (R18 — the 00189 cron's flips become Money items) ────
select
  'invoice'::text                           as kind,
  pp.id                                     as item_id,
  po.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'due'::text                               as state,
  'Vendor payment — ' || coalesce(pp.label, replace(pp.kind::text, '_', ' '))
                                            as title,
  coalesce(po.po_number, po.vendor_po_number, po.sidemark, 'PO') || ' · ' || v.name
                                            as detail,
  pp.due_date::timestamptz                  as ts,
  jsonb_build_object(
    'po_payment', true,
    'amount_cents', pp.amount_cents,
    'due_date', pp.due_date,
    'po_label', coalesce(po.po_number, po.vendor_po_number, po.sidemark),
    'vendor_name', v.name,
    'payment_kind', pp.kind
  )                                         as payload
from po_payments pp
join purchase_orders po on po.id = pp.purchase_order_id
join vendors v on v.id = po.vendor_id
where pp.state = 'due';

comment on view margin_items is
  'The Document margins (spec §5 + R14/R18/R23 + R33 F1/F6 + Track 5): unified '
  'index of decision/message/invoice/pulse/time/note items. The decision branch '
  'now carries coordination_kind + court so the rail renders the ball-in-court '
  'grammar (RFI/Submittal/Sign-off/Punch surface for free via the existing status '
  'filter). SECURITY INVOKER — base-table RLS applies.';

grant select on margin_items to authenticated;
grant select on margin_items to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. document_state — recreate the 00211 body, APPEND two rollup columns to
--    EVERY shape (Track 5):
--      items_in_your_court : pending client_decisions where court='designer'.
--      open_items_count    : pending client_decisions (any court).
--    Shape A computes both from a lateral; shapes B/C/D carry 0::bigint at the
--    same final position so the four-shape UNION stays column-aligned (UNION
--    matches by position). Every existing column/order is preserved.
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
  coalesce(co.open_items_count, 0)         as open_items_count
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
  0::bigint                                as open_items_count
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
  0::bigint                                as open_items_count
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
  coalesce(cp.full_name, 'New client')     as client_name,
  coalesce(cp.full_name, 'New client')     as title,
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
  0::bigint                                as open_items_count
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
  'The Document read model (R1 shapes A–D). v8 (00219): + items_in_your_court / '
  'open_items_count — Track 5 court rollups over client_decisions on shape A; 0 on '
  'shapes B/C/D. Supersedes the 00211 v7 definition additively (two appended '
  'columns; every prior column/order and proposal_updated_at unchanged).';

-- Re-issue grants explicitly (idempotent; defends any column/owner edge case).
grant select on document_state to authenticated;
grant select on document_state to service_role;
