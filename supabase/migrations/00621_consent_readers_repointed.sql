-- ═══════════════════════════════════════════════════════════════════════════
-- 00621 — People room CRM · W1a close-out: the three shipped SQL readers that
--          still asked the frozen seat
--
-- 00594 froze project_parties.sms_consent_* (R-AS) and repointed the two
-- readers the room prints — v_project_roster and people_directory — at
-- studio_channel_consent through channel_consent_status(). Close-out review
-- round 3 found three more SQL readers of the frozen column that nobody had
-- counted, two of them dispatch gates and one of them designer-facing today:
--
--   MAJOR-1  field_activity_summary.awaiting_reply_count (00282:578-582) counts
--            project_parties.sms_consent_status = 'pending'. The Field
--            Coordination Desk renders it as "N parties haven't opted in"
--            (use-field-activity.ts:48-55 -> field-desk.tsx:44-52). After the
--            freeze no consent act moves a seat, so the count never clears: the
--            Call Sheet said "Texting" and the Desk said the same person had
--            not opted in, off the same row.
--   MAJOR-3  fc_dispatch_court_assignment (00284:118-123) and
--            fc_dispatch_task_assignment (00284:176-181) RETURN NEW early when
--            v_party.sms_consent_status <> 'granted'. Nothing writes a seat to
--            'granted' any more, so assigning a coordination item or a task to
--            a sub whose consent the studio holds ON THE RECORD dispatched no
--            sms_court_assignment at all. It failed closed and it failed
--            silently, on a live un-flagged path.
--
-- Both are one expression. Every object here is GRAFTED from its grep-winning
-- body and changed in exactly that one place:
--
--   · field_activity_summary        lineage 00282:571-593 (its only definition
--                                   site — grep -rln "CREATE OR REPLACE VIEW
--                                   [^(]*field_activity_summary" -> 00282 alone)
--   · fc_dispatch_court_assignment  lineage 00284:101-145 (sole definition site)
--   · fc_dispatch_task_assignment   lineage 00284:160-203 (sole definition site)
--
-- THE GATE READS THE RECORD **OR** A PRE-FOLD SEAT THAT STILL SAYS granted.
-- The disjunct is not hedging: sendPartySms is the authority on every dispatch
-- these triggers fire (_shared/sms.ts channelConsentVerdict, then the legacy
-- reduction behind it), and it still honours a frozen seat holding a real
-- pre-fold grant. A gate that dropped that leg would refuse dispatches the
-- send rail itself would allow — a new silence, in the name of fixing one. The
-- consent word is COALESCEd to false, because channel_consent_status() returns
-- NULL for "no record" and a NULL in a plpgsql IF is not TRUE but a NULL in
-- `NOT (…)` is not FALSE either: without the COALESCE a party with no record
-- would fall THROUGH the guard and dispatch. Fail closed, explicitly.
--
-- The two views the Desk and the Call Sheet share now read one rule from one
-- place: channel_consent_status(project_consent_org(project_id), 'sms',
-- phone_e164). awaiting_reply_count asks it for 'pending' — a number the studio
-- has invited and is waiting on — and no record means `not_asked`, which is not
-- a party awaiting a reply, so the absence correctly counts zero.
--
-- Idempotent: CREATE OR REPLACE on all three, restated GRANTs, no DDL that
-- cannot be re-run. No RLS change (field_activity_summary is SECURITY INVOKER
-- and every count is scoped by the base tables' own RLS, exactly as shipped;
-- the two trigger functions are SECURITY DEFINER with their search_path pinned
-- and their triggers untouched).
--
-- After this file: regenerate supabase/seed/00-legacy-grants.sql
--   python3 scripts/generate-legacy-grants.py
--
-- Numbering: 00595–00620 are reserved for another program. W1b mints from
-- 00622 upward.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. field_activity_summary — the Desk rollup, repointed at the record
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00282:571-593. The unreviewed-SMS and overdue-task counts, the
-- party kinds, the SECURITY INVOKER marker and the grants are byte-identical;
-- only awaiting_reply_count's consent test changed.
CREATE OR REPLACE VIEW public.field_activity_summary
  WITH (security_invoker = true) AS
SELECT
  p.id AS project_id,
  (SELECT count(*) FROM public.sms_messages m
     WHERE m.project_id = p.id AND m.needs_review AND m.reviewed_at IS NULL)
                                                        AS unreviewed_sms_count,
  (SELECT count(*) FROM public.project_parties pp
     WHERE pp.project_id = p.id
       AND pp.party_kind IN ('gc', 'sub', 'installer', 'receiver')
       -- THE RECORD, NOT THE SEAT (R-AS, close-out r3 MAJOR-1).
       -- project_parties.sms_consent_status is frozen legacy since 00594, so a
       -- seat left at 'pending' at fold time stayed there for ever and this
       -- count never cleared. The studio's verdict for the number lives in
       -- studio_channel_consent; no record is what `not_asked` means, and a
       -- party nobody asked is not a party awaiting a reply, so the NULL
       -- correctly fails the test.
       AND public.channel_consent_status(
             public.project_consent_org(pp.project_id),
             'sms', pp.phone_e164) = 'pending')          AS awaiting_reply_count,
  (SELECT count(*) FROM public.project_tasks t
     WHERE t.project_id = p.id
       AND t.owner IN ('gc', 'sub', 'installer', 'receiver')
       AND t.status <> 'done'
       AND t.due_date IS NOT NULL
       AND t.due_date < current_date)                    AS overdue_field_task_count
FROM public.projects p;

COMMENT ON VIEW public.field_activity_summary IS
  'Field Coordination Desk "In the field" rollup: per project, unreviewed SMS, '
  'parties awaiting opt-in reply, and overdue field-owned tasks. SECURITY INVOKER '
  '— base-table RLS scopes every count to the querying team member. '
  'awaiting_reply_count reads the STUDIO CONSENT RECORD through '
  'channel_consent_status(project_consent_org(...)) since 00621, not '
  'project_parties.sms_consent_status, which 00594 froze: on the frozen column '
  'the Desk printed "N parties haven''t opted in" for parties the Call Sheet '
  'was printing "Texting" for, off the same row, and the count could never '
  'clear (close-out r3 MAJOR-1).';

-- The two grants 00282 shipped, restated verbatim. Deliberately NOT widened
-- and deliberately NOT narrowed: `anon` holds creation-time-default privileges
-- on this view on every stack older than the 2026-05-30 flip, and revoking
-- them here would be a posture change this close-out was not asked to make.
GRANT SELECT ON public.field_activity_summary TO authenticated;
GRANT SELECT ON public.field_activity_summary TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The two 00284 dispatch gates — the record, or a pre-fold seat
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00284:101-145 and :160-203. Both keep their shipped shape
-- exactly: the same early returns, the same party-kind filter, the same
-- fire-and-forget BEGIN/EXCEPTION around invoke_edge_function, the same
-- template key, vars, REVOKE and trigger definition. Only the consent test
-- moved off the frozen seat.

-- ── 2a. client_decisions.court_party_id → sms_court_assignment ──────────────
CREATE OR REPLACE FUNCTION public.fc_dispatch_court_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.project_parties;
BEGIN
  -- Only when a court party is actually (re)assigned and the item is live.
  IF NEW.court_party_id IS NULL OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.court_party_id IS NOT DISTINCT FROM OLD.court_party_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.court_party_id;
  IF NOT FOUND
     OR v_party.party_kind NOT IN ('gc', 'sub', 'installer', 'receiver')
     -- THE RECORD, NOT THE SEAT (R-AS, close-out r3 MAJOR-3). The seat is
     -- frozen legacy and nothing moves it to 'granted' any more, so this gate
     -- read a column that could only ever go stale. The pre-fold seat is kept
     -- as a second leg because sendPartySms still honours a real grant sitting
     -- on one, and COALESCEd to false because "no record" comes back NULL.
     OR (NOT COALESCE(
           public.channel_consent_status(
             public.project_consent_org(NEW.project_id),
             'sms', v_party.phone_e164) = 'granted',
           false)
         AND v_party.sms_consent_status <> 'granted') THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.court_party_id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_court_assignment',
        'type',        'field_court_assignment',
        'vars', jsonb_build_object(
          'item_title', NEW.title,
          'kind',       NEW.coordination_kind
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_court_assignment: dispatch failed for item %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_dispatch_court_assignment() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.fc_dispatch_court_assignment() IS
  'Field Coordination (00284): on a court_party_id (re)assignment to a consented '
  'field party (gc/sub/installer/receiver), fire sms-dispatch with the '
  'sms_court_assignment template. Fire-and-forget (00105 pattern). Since 00621 '
  'the consent test is the STUDIO RECORD — channel_consent_status('
  'project_consent_org(project_id), ''sms'', phone_e164) = ''granted'' — or a '
  'pre-fold seat still holding ''granted'', which sendPartySms also still '
  'honours. 00594 froze the seat column, so gating on it alone dispatched '
  'nothing for any consent recorded after the freeze (close-out r3 MAJOR-3).';

-- ── 2b. project_tasks.owner_party_id → sms_court_assignment ─────────────────
CREATE OR REPLACE FUNCTION public.fc_dispatch_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.project_parties;
BEGIN
  IF NEW.owner_party_id IS NULL OR NEW.status = 'done' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_party_id IS NOT DISTINCT FROM OLD.owner_party_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.owner_party_id;
  IF NOT FOUND
     OR v_party.party_kind NOT IN ('gc', 'sub', 'installer', 'receiver')
     -- The record, not the seat — the sibling's reason, verbatim (2a above).
     OR (NOT COALESCE(
           public.channel_consent_status(
             public.project_consent_org(NEW.project_id),
             'sms', v_party.phone_e164) = 'granted',
           false)
         AND v_party.sms_consent_status <> 'granted') THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.owner_party_id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_court_assignment',
        'type',        'field_task_assignment',
        'vars', jsonb_build_object(
          'item_title', NEW.title,
          'kind',       'task'
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_task_assignment: dispatch failed for task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_dispatch_task_assignment() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.fc_dispatch_task_assignment() IS
  'Field Coordination (00284): on an owner_party_id (re)assignment to a consented '
  'field party, fire sms-dispatch with the sms_court_assignment template. Since '
  '00621 the consent test is the studio record (or a pre-fold ''granted'' seat) '
  'rather than the column 00594 froze — see fc_dispatch_court_assignment.';
