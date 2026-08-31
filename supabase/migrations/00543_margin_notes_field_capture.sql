-- ═══════════════════════════════════════════════════════════════════════════
-- 00543_margin_notes_field_capture.sql — the MARGIN MIGRATION (Field
-- Companion wave 4, package 4-3). Spec: docs/design/field-companion/
-- field-companion-package.md §9.4.
--
-- ⚠ NUMBERED 00543 — NOT drawn from the reserved band 00530–00535 (FC-R17).
--   That band is CLOSED/EXHAUSTED: `00530` and `00532` are this program's
--   (waves 1 and 3), `00531` is an unrelated `uuid_generate_v5` grant hotfix,
--   and `00533`/`00534`/`00535` were drawn by OTHER lanes
--   (`00533_piece_detail_contract.sql`, `00534_client_attention_notifications.sql`,
--   `00535_saved_items_price_snapshot.sql`) before wave 4 ran its landing
--   census. Wave 4 drew `00543–00545` above the head (`00542`) instead — see
--   docs/engineering/migration-number-reservations.md. This file already
--   lives in supabase/migrations/, not docs/design/field-companion/plans/sql/.
--
-- WHAT THIS DOES — two things, both additive:
--   (a) margin_notes.field_capture_id — the back-reference from a designer's
--       margin note to the field capture she spoke it into.
--   (b) CREATE OR REPLACE VIEW margin_items, recreating 00282:606-909
--       BYTE-FOR-BYTE and changing exactly one UNION arm: the `note` branch.
--       Same 11 columns, same order, same types, so the replace is
--       column-compatible and every downstream reader (margin-derivation.ts's
--       MarginItemRow, margin-item.tsx, margin-bodies.tsx) keeps compiling.
--
-- WHY THE VIEW HAS TO CHANGE AT ALL. Today the note branch emits
-- `left(n.body, 80) as title` and `''::text as detail` (00282:828-829), and
-- NoteBody (margin-bodies.tsx:814-895) renders the author and the escalation
-- actions and never the body. A one-minute site transcript therefore reaches
-- the Document as its first eighty characters, and useEscalateNoteToDecision
-- forwards `body: row.title` (margin-bodies.tsx:854-860) — so escalating it
-- produces a client decision whose text is those eighty characters. Fine for
-- the R14 five-second typed note the branch was built for. Not fine for the
-- artifact this whole program exists to move. FC-R4 says the device may write
-- margin_notes directly; that ruling is only worth having if the note it
-- writes is readable.
--
-- WHAT THIS DOES NOT DO:
--   · No new margin kind. margin-derivation.ts's MarginKind union is untouched.
--   · No widening of margin_notes.anchor_kind — a field note anchors to
--     'letterhead', the view's own default (00196:31-32). Do NOT touch that
--     CHECK.
--   · No change to chk_margin_notes_engagement (00224:100-102).
--   · No new accent, no new rail branch, no Desk population.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE VIEW. Safe to re-run.
--
-- REVERSIBLE: re-apply 00282:606-909 verbatim to restore the prior view body.
-- The column is additive and inert without a Field build that writes it.
--
-- ACLs: no new routine is created here, so constraint C7's
-- "REVOKE ALL … FROM PUBLIC, anon" does not apply. The view's grants are
-- restated below exactly as 00282:908-909 has them (CREATE OR REPLACE VIEW
-- preserves grants; restating is belt-and-braces, not a fix).
--
-- ⚠ ONE DELIBERATE DEPARTURE from the byte-for-byte discipline, so a reviewer
-- diffing this against 00282:606-909 can see it was chosen rather than slipped:
-- the CREATE OR REPLACE VIEW and both GRANTs are written as `public.margin_items`
-- where 00282 writes them bare. Same reason the `time` branch qualifies
-- extensions.uuid_generate_v5 below: the prod push session does not run under
-- the default search_path, and an unqualified CREATE OR REPLACE VIEW resolves
-- against whatever schema happens to be first on it. Everything else in this
-- file is already qualified (public.margin_notes, public.field_captures,
-- pg_get_viewdef('public.margin_items'::regclass)); this makes the view itself
-- match. The DO $postcondition$ block at the end is the belt: it resolves
-- 'public.margin_items'::regclass and asserts the new definition, so a view
-- created in the wrong schema fails loudly INSIDE the transaction.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (a) the back-reference ──────────────────────────────────────────────────
-- ON DELETE SET NULL, not CASCADE: if a capture is ever purged the designer's
-- own words survive as a plain margin note. The note is hers; the capture is
-- evidence attached to it.
ALTER TABLE public.margin_notes
  ADD COLUMN IF NOT EXISTS field_capture_id uuid
    REFERENCES public.field_captures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_margin_notes_field_capture
  ON public.margin_notes (field_capture_id)
  WHERE field_capture_id IS NOT NULL;

COMMENT ON COLUMN public.margin_notes.field_capture_id IS
  'Field Companion wave 4 (§9.4): the field_captures row this note was spoken '
  'into. NULL for every typed R14 note. Set by the device through the capture '
  'outbox after commit_field_capture returns a receipt (FC-R4).';

-- ── (b) margin_items — 00282:606-909, note branch only changed ─────────────
-- Schema-qualified (unlike the 00282 original) — see the header's "ONE
-- DELIBERATE DEPARTURE" note.
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
    -- The full note. Every consumer that needs the words reads this key; the
    -- escalation hooks stop forwarding the 80-character title.
    'body', n.body,
    -- The field lane. All NULL/false/[] on a typed R14 note, so nothing about
    -- a field-less project changes shape (FC-R10's browser-verified criterion).
    'field_capture_id', n.field_capture_id,
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
  'the Post (needs_review → triage state). SECURITY INVOKER — base-table RLS applies.';

grant select on public.margin_items to authenticated;
grant select on public.margin_items to service_role;

-- ── (c) postcondition — the house self-verification block (00513's pattern) ──
DO $postcondition$
DECLARE
  v_has_column boolean;
  v_note_carries_body boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'margin_notes'
      AND column_name = 'field_capture_id'
  ) INTO v_has_column;
  IF NOT v_has_column THEN
    RAISE EXCEPTION 'margin migration: margin_notes.field_capture_id is missing';
  END IF;

  -- ⚠ F14: a bare '%field_capture_id%' match is satisfied by the column
  -- reference alone (e.g. the join predicate) and says nothing about the
  -- payload keys the note branch is supposed to add. Require 'capture_visible'
  -- and the 'body' key too, so this cannot pass on a view carrying none of
  -- the field-note payload.
  SELECT pg_get_viewdef('public.margin_items'::regclass) LIKE '%field_capture_id%'
     AND pg_get_viewdef('public.margin_items'::regclass) LIKE '%capture_visible%'
     AND pg_get_viewdef('public.margin_items'::regclass) LIKE '%''body''%'
    INTO v_note_carries_body;
  IF NOT v_note_carries_body THEN
    RAISE EXCEPTION
      'margin migration: margin_items was not replaced with the field-note payload';
  END IF;
END
$postcondition$;

COMMIT;
