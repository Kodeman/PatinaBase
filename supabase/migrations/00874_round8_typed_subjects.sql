-- 00874 — C7 typed note subjects, visible Field room, atomic draft escalation.
-- Subject integrity is not authorization: 00867's restrictive ALL policy and
-- both row images are unchanged. No backfill and no outbound ref_type CHECK.
-- project_package is deferred to X03/00877 by orchestrator ruling: C1 is absent.
-- margin_items lineage: 00194 → 00200 → 00202 → 00206 → 00282 → 00543 → 00613.
-- Its latest 00613 body below gains only the visible capture's room payload.

ALTER TABLE public.margin_notes
  ADD COLUMN IF NOT EXISTS subject_kind text,
  ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE public.margin_notes DROP CONSTRAINT IF EXISTS margin_notes_subject_pair_check;
ALTER TABLE public.margin_notes ADD CONSTRAINT margin_notes_subject_pair_check
  CHECK ((subject_kind IS NULL) = (subject_id IS NULL));
ALTER TABLE public.margin_notes DROP CONSTRAINT IF EXISTS margin_notes_subject_kind_check;
ALTER TABLE public.margin_notes ADD CONSTRAINT margin_notes_subject_kind_check
  CHECK (subject_kind IS NULL OR subject_kind IN (
    'ffe_item', 'project_room', 'plan_print', 'plan_issue', 'purchase_order',
    'field_capture', 'coordination_item'));

CREATE OR REPLACE FUNCTION public._subject_project_id(p_kind text, p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT project_id FROM (
    SELECT project_id FROM public.project_ffe_items WHERE p_kind = 'ffe_item' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.project_rooms WHERE p_kind = 'project_room' AND id = p_id
    UNION ALL
    SELECT s.project_id FROM public.plan_prints p JOIN public.plan_sheets s ON s.id = p.sheet_id
      WHERE p_kind = 'plan_print' AND p.id = p_id
    UNION ALL
    SELECT project_id FROM public.plan_issues WHERE p_kind = 'plan_issue' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.purchase_orders WHERE p_kind = 'purchase_order' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.field_captures WHERE p_kind = 'field_capture' AND id = p_id
    UNION ALL
    SELECT project_id FROM public.client_decisions WHERE p_kind = 'coordination_item' AND id = p_id
  ) subjects;
$$;
REVOKE ALL ON FUNCTION public._subject_project_id(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guard_margin_note_subject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.subject_kind IS NULL AND NEW.subject_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.subject_kind IS NULL OR NEW.subject_id IS NULL
     OR NEW.subject_kind NOT IN ('ffe_item', 'project_room', 'plan_print',
       'plan_issue', 'purchase_order', 'field_capture', 'coordination_item') THEN
    RAISE EXCEPTION 'subject_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'subject_requires_project' USING ERRCODE = 'check_violation';
  END IF;
  IF public._subject_project_id(NEW.subject_kind, NEW.subject_id) IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'subject_off_project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_margin_note_subject()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS margin_note_subject_guard ON public.margin_notes;
CREATE TRIGGER margin_note_subject_guard BEFORE INSERT OR UPDATE ON public.margin_notes
  FOR EACH ROW EXECUTE FUNCTION public._guard_margin_note_subject();

INSERT INTO public.server_capabilities(key, enabled) VALUES ('margin_note_escalation', false)
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.escalate_margin_note(p_note_id uuid, p_decision_id uuid)
RETURNS public.client_decisions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_note public.margin_notes%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_relationship_id uuid;
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'note access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT COALESCE((SELECT enabled FROM public.server_capabilities
                  WHERE key = 'margin_note_escalation'), false) THEN
    RAISE EXCEPTION 'margin_note_escalation_inactive' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_note FROM public.margin_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND OR NOT public.margin_note_tenant_admits(v_note.project_id,
       v_note.proposal_id, v_note.designer_client_id, v_note.designer_id)
     OR NOT (v_note.designer_id = auth.uid() OR public.is_studio_comember(v_note.designer_id)) THEN
    RAISE EXCEPTION 'note access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL OR v_note.project_id IS NULL THEN
    RAISE EXCEPTION 'project-bound decision required' USING ERRCODE = 'check_violation';
  END IF;
  IF v_note.subject_kind IS NOT NULL AND (
      v_note.subject_kind NOT IN ('ffe_item', 'project_room', 'plan_print',
        'plan_issue', 'purchase_order', 'field_capture', 'coordination_item')
      OR public._subject_project_id(v_note.subject_kind, v_note.subject_id)
         IS DISTINCT FROM v_note.project_id) THEN
    RAISE EXCEPTION 'subject_off_project' USING ERRCODE = 'check_violation';
  END IF;
  IF v_note.escalated_to_decision_id IS NOT NULL THEN
    IF v_note.escalated_to_decision_id IS DISTINCT FROM p_decision_id THEN
      RAISE EXCEPTION 'note already escalated' USING ERRCODE = 'unique_violation';
    END IF;
    SELECT * INTO v_decision FROM public.client_decisions WHERE id = p_decision_id;
    IF NOT FOUND OR v_decision.project_id IS DISTINCT FROM v_note.project_id THEN
      RAISE EXCEPTION 'decision off project' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN v_decision;
  END IF;
  IF v_note.escalated_to_scope_change_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.client_decisions WHERE id = p_decision_id) THEN
    RAISE EXCEPTION 'escalation conflict' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_note.project_id;
  SELECT id INTO STRICT v_relationship_id FROM public.designer_clients
    WHERE designer_id = v_project.designer_id AND client_id = v_project.client_id;
  -- Inherited decision readers can see drafts: never copy private note text.
  -- The designer writes client-facing text in the decision editor before Send.
  v_decision := public.create_client_decision(p_decision_id, jsonb_build_object(
    'designer_client_id', v_relationship_id, 'project_id', v_note.project_id,
    'title', 'Decision from a studio note',
    'context', NULL, 'status', 'draft', 'court', 'designer',
    'blocking_status', 'non_blocking'), '[]'::jsonb, '{}'::uuid[], '{}'::uuid[]);
  UPDATE public.margin_notes SET escalated_to_decision_id = v_decision.id, updated_at = now()
    WHERE id = v_note.id;
  RETURN v_decision;
END;
$$;
REVOKE ALL ON FUNCTION public.escalate_margin_note(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

create or replace view public.margin_items
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
      then coalesce(nullif(btrim(p.full_name), ''), st.studio_name)
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
  -- Schema-qualified (unlike the 00219 original): the prod push session's
  -- search_path does not include `extensions`, so the bare name fails there.
  extensions.uuid_generate_v5(
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
    and pte.project_id is not null   -- 00613 (HT-15): an internal hour has no margin
    and pte.started_at > now() - interval '7 days'
  group by pte.project_id, date(pte.started_at)
) te
union all

-- ── note (R14 — designer-authored marginalia; studio-only via RLS) ──────────
-- ⚠ THIS BRANCH IS THE ONLY CHANGE IN THIS MIGRATION. Every other branch above
--   and below is 00282:606-909 byte-for-byte (00282's own discipline for this
--   view, stated at 00282:600-604). Column count, order and types are
--   unchanged — 11 columns — so CREATE OR REPLACE stays column-compatible.
--
--   What changes, and why:
--   1. `title` STAYS `left(n.body, 80)`. It is the rail's one-line lede and
--      margin-item.tsx:60 renders it in the collapsed row.
--   2. `detail` STAYS ''::text. margin-item.tsx:64 feeds `row.detail` to the
--      collapsed-row preview for EVERY kind, so widening it here would dump a
--      full transcript into the rail. The body travels in the payload instead.
--   3. `payload` GAINS the field-note lane. Package §9.4 requires the full body
--      to reach the Document: a one-minute transcript arriving as its first
--      eighty characters is the failure this migration exists to fix.
--
--   ⚠ SECURITY INVOKER (00282:606-607) means the field_captures join runs under
--   the READER's RLS. A studio co-member can read the note
--   (margin_notes_studio_read, 00316:309-330) but not the capture
--   (owner-only unless status='inbox' AND same organization, 00233:155-188), so
--   the join returns NULL for her. `capture_visible` makes that legible instead
--   of silent: false means "there is a capture and it is not yours to open",
--   and NoteBody renders an honest line rather than a dead play button. This is
--   FC-R8 (per-designer in v1) surfacing in a view rather than a policy, and
--   §3.3 forbids dropping it silently.
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
    'author_name', ap.full_name,
    -- The full note — FIELD NOTES ONLY. W4-C8 explicitly does NOT take a full
    -- body for typed R14 notes this wave: readFieldNotePayload falls back to
    -- row.title (left(body, 80)) when this key is null, which is byte-for-byte
    -- the pre-wave escalation and amendment seed. Emitting n.body
    -- unconditionally would have changed the typed-note escalation silently.
    'body', case when n.field_capture_id is not null then n.body else null end,
    -- The field lane. All NULL/false/[] on a typed R14 note, so nothing about
    -- a field-less project changes shape (FC-R10's browser-verified criterion).
    'field_capture_id', n.field_capture_id,
    'project_room_id', fc.project_room_id,
    'capture_visible', (n.field_capture_id IS NOT NULL AND fc.id IS NOT NULL),
    -- ⚠ F1: neither voice_audio_segments nor photos carries an arrayness
    -- CHECK, and `authenticated` can PATCH either through PostgREST to any
    -- jsonb value. jsonb_array_length()/jsonb_array_elements() on a non-array
    -- raise 22023 — unguarded, that error propagates out of the whole UNION
    -- ALL view, so one malformed capture killed EVERY margin kind for that
    -- designer, not just the note. jsonb_typeof(...) = 'array' guards both:
    -- a malformed value degrades to '[]'/0 instead of raising.
    'has_audio', (
      fc.voice_audio_path IS NOT NULL
      OR (
        jsonb_typeof(coalesce(fc.voice_audio_segments, '[]'::jsonb)) = 'array'
        AND jsonb_array_length(coalesce(fc.voice_audio_segments, '[]'::jsonb)) > 0
      )
    ),
    'audio_path', fc.voice_audio_path,
    'audio_segments', case
      when jsonb_typeof(coalesce(fc.voice_audio_segments, '[]'::jsonb)) = 'array'
        then coalesce(fc.voice_audio_segments, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'voice_duration_seconds', fc.voice_duration_seconds,
    'transcript_source', fc.transcript_source,
    -- Storage keys only, in capture order. The portal signs them with
    -- useCaptureMediaUrls(paths, ttl) (§11.1); the view never mints a URL.
    'photo_paths', case
      when jsonb_typeof(coalesce(fc.photos, '[]'::jsonb)) = 'array' then coalesce(
        (select jsonb_agg(ph->>'path' order by ph_ord)
           from jsonb_array_elements(coalesce(fc.photos, '[]'::jsonb))
                with ordinality as t(ph, ph_ord)
          where ph->>'path' is not null),
        '[]'::jsonb)
      else '[]'::jsonb
    end
  )                                         as payload
from margin_notes n
left join profiles ap on ap.id = n.designer_id
left join field_captures fc on fc.id = n.field_capture_id

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
where pp.state = 'due'

union all

-- ── field_sms (Field Coordination Wave 1 — inbound texts land in the Post) ──
-- One margin item per inbound field text. needs_review rows read 'needs_review'
-- (the Desk triage state); applied ones read 'logged'. The payload carries the
-- parse/apply provenance + any media so the rail renders the thread inline.
select
  'field_sms'::text                         as kind,
  m.id                                      as item_id,
  m.project_id                              as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  case when m.needs_review and m.reviewed_at is null then 'needs_review' else 'logged' end
                                            as state,
  coalesce(pp.display_name, 'Field text')   as title,
  coalesce(left(m.body, 140), '')           as detail,
  m.created_at                              as ts,
  jsonb_build_object(
    'direction', m.direction,
    'party_id', m.party_id,
    'party_kind', pp.party_kind,
    'trade', pp.trade,
    'confidence', m.confidence,
    'needs_review', m.needs_review,
    'parsed_intent', m.parsed_intent,
    'applied_effect', m.applied_effect,
    'media', m.media
  )                                         as payload
from sms_messages m
left join project_parties pp on pp.id = m.party_id
where m.direction = 'inbound' and m.project_id is not null;

comment on view public.margin_items is
  'The Document margins (spec §5 + R14/R18/R23 + R33 F1/F6 + Track 5 + Field '
  'Coordination): unified index of decision/message/invoice/pulse/time/note/'
  'field_sms items. The field_sms branch (00282) surfaces inbound field texts in '
  'the Post (needs_review → triage state). The time branch excludes project-less '
  'internal hours (HT-15, 00613) — an hour with no project has no margin. '
  'SECURITY INVOKER — base-table RLS applies.';

grant select on public.margin_items to authenticated;
grant select on public.margin_items to service_role;

