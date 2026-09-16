-- ═══════════════════════════════════════════════════════════════════════════
-- 00635 — People room CRM · W4 (P3, 1 of 3): the touch, and the email rail's
--         ref for a person with no account
--
-- E13 (crm-model §1) is the only entity in the model with no table anywhere in
-- Patina. CRM-22 is the harm: "an inbound approval is matched to a phone and
-- never to an approver, so a 'go ahead' from someone with no money authority
-- reads the same as a signature" (CS4-4, CS5-10, CS6-3). CRM-23 is the other
-- half: "nothing records who was told when a fact changed: a gate code, a
-- schedule slip, a key handover" (CS2-22, CS5-24) — 00101's comms tables cover
-- logins only.
--
-- studio_touches is that record. It is NOT a stored activity log (PD-8): the
-- rails write one row per contact they actually make, and the room DERIVES
-- "last contact" from it. Nothing reads it to decide anything; it answers
-- after the fact who was told what, on which channel, and whether the person
-- who said yes had the standing to.
--
-- THREE THINGS THIS FILE DECIDES THAT THE BRIEF LEFT OPEN, each named so a
-- reviewer can overrule it in one line rather than reading the body:
--
--  1. subject_type carries a FOURTH value, 'project', beside the brief's
--     person | company | engagement. record_notice's signature (fixed by
--     Patina Field, which already calls it — build/w5-build-report.md §3) is
--     (p_project_id, p_what, p_told): its subject is the JOB, not a person.
--     Writing a project notice as subject_type 'engagement' pointed at one of
--     the told seats would say the notice was about that person, which is
--     false. The value is additive and no reader of the other three changes.
--  2. channel_kind is NULLABLE. record_notice carries no channel argument, and
--     a notice whose channel the record does not know must say so rather than
--     be stamped with a guess. Every rail-written touch names one.
--  3. The org is resolved SERVER-SIDE, inside record_touch, and never passed
--     in — R-BD's project_tenant_org() for a seat or a job, studio_contact_org()
--     for a card. A touch whose studio cannot be resolved is NOT WRITTEN and
--     the RPC answers NULL: an unattributable record is one no studio could
--     ever read back (the R-AW posture — a fact the rail cannot record is a
--     fact it may not pretend to have recorded). On the studio-less legacy
--     population R-BD/R-BI name, that is the whole population, until W3's
--     backfill stamps projects.studio_id.
--
-- ALSO HERE: notification_log's ref_type vocabulary gains
-- 'studio_contact_channel'. CRM-12's letter to a person with no Patina account
-- has no user_id, and 00591 made user_id nullable precisely so a ref could
-- identify such a row — but its CHECK names only invoice / client_invitation /
-- client_review / proposal, so the channel-addressed letter had no ref it was
-- allowed to carry, and _shared/send-email.ts's `shouldLog` (userId || ref)
-- dropped the row entirely. No row, no provider_id, and resend-webhook can
-- never match the bounce back to the address that bounced.
--
-- Lineage: studio_touches, record_touch, record_notice are all NEW — verified
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*record_notice" supabase/migrations/*.sql
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*record_touch"  supabase/migrations/*.sql
-- both empty at 00634. notification_log_ref_type_chk: 00591 → this file (the
-- 00591 body verbatim plus one value).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. notification_log.ref_type — the channel-addressed letter's own ref
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS notification_log_ref_type_chk;

ALTER TABLE public.notification_log
  ADD CONSTRAINT notification_log_ref_type_chk
  CHECK (ref_type IS NULL OR ref_type IN
         ('invoice', 'client_invitation', 'client_review', 'proposal',
          'studio_contact_channel'));

COMMENT ON COLUMN public.notification_log.ref_type IS
  'The kind of business record this notification is about: invoice, '
  'client_invitation, client_review, proposal (00591), or '
  'studio_contact_channel — the typed reach channel a letter to a person with '
  'no Patina account was addressed to (00635, CRM-12). The last one is what '
  'earns such a letter a log row at all: sendCompliantEmail logs on '
  '(user_id OR ref), and an account-less recipient has no user_id.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. studio_touches — E13
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_touches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  subject_type    text NOT NULL,
  subject_id      uuid NOT NULL,

  -- NULL when the record does not say (see the banner, decision 2).
  channel_kind    text,
  direction       text NOT NULL,

  occurred_at     timestamptz NOT NULL DEFAULT now(),

  -- Who made the touch: an auth.users id as text for a studio member, a rail
  -- name ('sms-inbound', 'field-daily') for a machine, NULL for neither. Text
  -- rather than a uuid FK because half the actors are not people.
  actor_ref       text,

  decision_class  text NOT NULL DEFAULT 'none',
  authority_check text NOT NULL DEFAULT 'n/a',

  -- CRM-23: the fact that changed, in the studio's own words.
  notice_of       text,
  -- Seat ids and/or person-card ids that were told. Arrays carry no FK; the
  -- RPCs below resolve every entry before storing it.
  notified_refs   uuid[] NOT NULL DEFAULT '{}'::uuid[],

  -- The row in the message rails this touch stands for: an sms_messages id, a
  -- notification_log id, an sms_conversations id. Text because the three live
  -- in different tables and a touch is a derivation, not an FK graph.
  message_ref     text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Vocabulary as named constraints so a rerun over an existing table really
-- does widen them (CREATE TABLE IF NOT EXISTS skips inline CHECKs) — the
-- 00592/00593/00623 idiom.
ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_subject_type_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_subject_type_check CHECK (
    subject_type IN ('person', 'company', 'engagement', 'project')
  );

ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_direction_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_direction_check CHECK (
    direction IN ('in', 'out')
  );

-- The rails' channels plus the reach tiers a touch can arrive on. Not
-- studio_contact_channels' vocabulary: that table types an ADDRESS, this
-- column types a CONTACT, and a notice told in person has no address at all.
ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_channel_kind_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_channel_kind_check CHECK (
    channel_kind IS NULL OR channel_kind IN (
      'sms', 'email', 'call', 'in_person', 'app', 'field_link', 'paper', 'other'
    )
  );

-- direction §7 P3's list, verbatim.
ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_decision_class_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_decision_class_check CHECK (
    decision_class IN ('none', 'logistics', 'selection', 'money', 'schedule',
                       'site_access')
  );

ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_authority_check_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_authority_check_check CHECK (
    authority_check IN ('n/a', 'passed', 'failed_no_authority',
                        'failed_unknown_sender')
  );

-- A decision with no class cannot have been authority-checked, and a checked
-- touch must name the class it was checked against. Without this the two
-- columns drift into saying different things about the same message.
ALTER TABLE public.studio_touches
  DROP CONSTRAINT IF EXISTS studio_touches_authority_needs_class_check;
ALTER TABLE public.studio_touches
  ADD CONSTRAINT studio_touches_authority_needs_class_check CHECK (
    authority_check = 'n/a' OR decision_class <> 'none'
  );

COMMENT ON TABLE public.studio_touches IS
  'E13 (crm-model §1, direction §7 P3): one row per contact a rail actually '
  'made, in either direction, with the decision class it carried and whether '
  'the person who sent it had the standing to send it. Derived onto the '
  'person card; never read to decide anything (PD-8). CRM-22 (an approval '
  'from a phone with no authority) and CRM-23 (who was told when a fact '
  'changed) are the two harms. Written ONLY through record_touch() and '
  'record_notice(); RLS is is_active_studio_member(organization_id), and the '
  'org is resolved server-side by the RPCs so a caller cannot file a touch '
  'into a studio it does not belong to.';

COMMENT ON COLUMN public.studio_touches.subject_type IS
  'person | company (a studio_contacts card), engagement (a project_parties '
  'seat), or project (a job-level notice: record_notice''s subject, whose '
  'signature is fixed by Patina Field and names a project, not a person).';
COMMENT ON COLUMN public.studio_touches.channel_kind IS
  'How the contact was made, or NULL when the record does not say — '
  'record_notice carries no channel argument and will not guess one.';
COMMENT ON COLUMN public.studio_touches.authority_check IS
  'n/a (no decision was filed), passed, failed_no_authority (the seat holds '
  'no in-force grant for this class), failed_unknown_sender (the message '
  'resolved to no seat at all). CRM-22: "received, not authority".';

CREATE INDEX IF NOT EXISTS idx_studio_touches_subject
  ON public.studio_touches (subject_type, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_touches_org_occurred
  ON public.studio_touches (organization_id, occurred_at DESC);
-- "which touches failed their authority check" — the only predicate a face
-- asks that is not subject-keyed.
CREATE INDEX IF NOT EXISTS idx_studio_touches_failed_authority
  ON public.studio_touches (organization_id, occurred_at DESC)
  WHERE authority_check <> 'n/a' AND authority_check <> 'passed';

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.studio_touches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_touches_member_select ON public.studio_touches;
CREATE POLICY studio_touches_member_select
  ON public.studio_touches FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

-- No INSERT/UPDATE/DELETE policy, deliberately: a touch is a rail's record of
-- something that happened, not a row a member may write, correct or erase.
-- Both write doors are the SECURITY DEFINER RPCs below.
REVOKE ALL ON TABLE public.studio_touches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studio_touches TO authenticated;
GRANT ALL ON public.studio_touches TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. record_touch — the rails' write door
-- ═══════════════════════════════════════════════════════════════════════════
-- service_role only: sendPartySms, sendCompliantEmail and sms-inbound are the
-- callers, all of them edge functions holding the service key. Returns the
-- touch id, or NULL when the studio could not be resolved (see banner 3).
CREATE OR REPLACE FUNCTION public.record_touch(
  p_subject_type   text,
  p_subject_id     uuid,
  p_channel_kind   text        DEFAULT NULL,
  p_direction      text        DEFAULT 'out',
  p_occurred_at    timestamptz DEFAULT now(),
  p_actor_ref      text        DEFAULT NULL,
  p_decision_class text        DEFAULT 'none',
  p_authority_check text       DEFAULT 'n/a',
  p_notice_of      text        DEFAULT NULL,
  p_notified_refs  uuid[]      DEFAULT '{}'::uuid[],
  p_message_ref    text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_id  uuid;
BEGIN
  IF p_subject_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- R-BD: every tenant resolution for a project goes through
  -- project_tenant_org(). Under service_role auth.uid() is NULL, so that
  -- function's caller-relative second leg contributes nothing and the answer
  -- is projects.studio_id or NULL — which is the correct, caller-independent
  -- answer for a stored row.
  v_org := CASE p_subject_type
    WHEN 'engagement' THEN public.project_tenant_org(
      (SELECT pp.project_id FROM public.project_parties pp WHERE pp.id = p_subject_id))
    WHEN 'project'    THEN public.project_tenant_org(p_subject_id)
    ELSE public.studio_contact_org(p_subject_id)
  END;

  IF v_org IS NULL THEN
    -- A touch no studio can read back is a record that does not exist. Say so
    -- rather than file it somewhere convenient.
    RETURN NULL;
  END IF;

  INSERT INTO public.studio_touches (
    organization_id, subject_type, subject_id, channel_kind, direction,
    occurred_at, actor_ref, decision_class, authority_check, notice_of,
    notified_refs, message_ref
  ) VALUES (
    v_org, p_subject_type, p_subject_id, p_channel_kind,
    COALESCE(p_direction, 'out'), COALESCE(p_occurred_at, now()), p_actor_ref,
    COALESCE(p_decision_class, 'none'), COALESCE(p_authority_check, 'n/a'),
    p_notice_of, COALESCE(p_notified_refs, '{}'::uuid[]), p_message_ref
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_touch(text, uuid, text, text, timestamptz,
  text, text, text, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_touch(text, uuid, text, text,
  timestamptz, text, text, text, text, uuid[], text) TO service_role;

COMMENT ON FUNCTION public.record_touch(text, uuid, text, text, timestamptz,
  text, text, text, text, uuid[], text) IS
  'The send and inbound rails'' write door onto studio_touches (E13). '
  'service_role only. The studio is resolved here and never passed in: '
  'project_tenant_org() for a seat or a job (R-BD), studio_contact_org() for '
  'a card. Returns the touch id, or NULL when no studio resolves — on the '
  'studio-less legacy population (R-BI) nothing is written and the rail '
  'carries on, because a touch nobody can read back is not a record.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. record_notice — CRM-23's write, and Patina Field's one call
-- ═══════════════════════════════════════════════════════════════════════════
-- The signature and the return shape are FIXED by a shipped caller:
-- apps/mobile/Capture/.../SupabasePeopleRoomService.swift sends
-- (p_project_id, p_what, p_told) and decodes ONE row of
-- (id, what, recorded_at, recorded_by, told_names) — build/w5-build-report.md
-- §3 names both and asks that they be checked against the real signature when
-- this lands. They are what is written here.
--
-- `told` may carry seat ids (project_parties on this job) or person-card ids
-- (studio_contacts in this studio); the phone sends seat ids, the desk will
-- send both. Only refs that RESOLVE are stored, so notified_refs and
-- told_names can never disagree about who the studio said it told.
CREATE OR REPLACE FUNCTION public.record_notice(
  p_project_id uuid,
  p_what       text,
  p_told       uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  id          uuid,
  what        text,
  recorded_at timestamptz,
  recorded_by text,
  told_names  text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org         uuid;
  v_what        text := btrim(COALESCE(p_what, ''));
  v_refs        uuid[];
  v_names       text[];
  v_id          uuid;
  v_at          timestamptz := now();
  v_by          text;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'notice_project_required' USING ERRCODE = 'check_violation';
  END IF;
  IF v_what = '' THEN
    RAISE EXCEPTION 'notice_what_required'
      USING HINT = 'A notice records the fact that changed, in words.',
            ERRCODE = 'check_violation';
  END IF;

  v_org := public.project_tenant_org(p_project_id);
  IF v_org IS NULL OR NOT public.is_active_studio_member(v_org) THEN
    -- One refusal for "no studio on this job" and for "not your studio": a
    -- notice door must not tell a stranger which of the two it is.
    RAISE EXCEPTION 'notice_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Seats on THIS job, then cards in THIS studio. Anything else is dropped.
  SELECT COALESCE(array_agg(t.ref ORDER BY t.name), '{}'::uuid[]),
         COALESCE(array_agg(t.name ORDER BY t.name), '{}'::text[])
    INTO v_refs, v_names
    FROM (
      SELECT pp.id AS ref, COALESCE(pp.display_name, 'Someone on the job') AS name
        FROM public.project_parties pp
       WHERE pp.project_id = p_project_id
         AND pp.id = ANY (COALESCE(p_told, '{}'::uuid[]))
      UNION
      SELECT sc.id, COALESCE(sc.full_name, sc.company_name, 'Someone in the book')
        FROM public.studio_contacts sc
       WHERE sc.organization_id = v_org
         AND sc.id = ANY (COALESCE(p_told, '{}'::uuid[]))
    ) t;

  INSERT INTO public.studio_touches (
    organization_id, subject_type, subject_id, channel_kind, direction,
    occurred_at, actor_ref, decision_class, authority_check, notice_of,
    notified_refs
  ) VALUES (
    v_org, 'project', p_project_id, NULL, 'out',
    v_at, auth.uid()::text, 'none', 'n/a', v_what,
    COALESCE(v_refs, '{}'::uuid[])
  )
  RETURNING studio_touches.id INTO v_id;

  SELECT NULLIF(btrim(COALESCE(pr.display_name, pr.full_name, '')), '')
    INTO v_by
    FROM public.profiles pr
   WHERE pr.id = auth.uid();

  RETURN QUERY SELECT v_id, v_what, v_at, v_by, COALESCE(v_names, '{}'::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.record_notice(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_notice(uuid, text, uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_notice(uuid, text, uuid[]) IS
  'CRM-23: record that a fact about this job changed and who was told. Writes '
  'one studio_touches row with subject_type ''project'' and returns the single '
  'row Patina Field decodes — id, what, recorded_at, recorded_by (a NAME, not '
  'an id), told_names. Gated on is_active_studio_member(project_tenant_org()) '
  '(R-BD); a studio-less job and a stranger both get notice_not_authorized, '
  'so the door names no facts. Only told refs that resolve to a seat on this '
  'job or a card in this studio are stored, so notified_refs and told_names '
  'always agree (00635).';
