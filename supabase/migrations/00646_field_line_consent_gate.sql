-- ═══════════════════════════════════════════════════════════════════════════
-- 00646 — The Field Line: the consent gate reads the RECORD, a withdrawn
--         challenge cannot grant, and the resend's evidence has a shape
--
-- Contract US-2 (Phase 1) P1/P2. Three findings from SQ-92's review of 00644,
-- repaired together because all three are about the same question: what a
-- challenge and its consent record are allowed to say.
--
--   F1 (in _shared/sms.ts, not here) — the sms_optin_invite gate proved its
--      evidence off project_parties.sms_consent_source / _evidence /
--      _recorded_at / _disclosure_version. 00594's refuse_legacy_consent_write
--      trigger FREEZES those columns (:854, :990): every write raises
--      consent_legacy_column_frozen, so on every stack past 00594 they are NULL
--      and the gate refused EVERY invite — including the one
--      resend_party_invite has already spent the challenge's single resend on.
--      The gate now reads studio_channel_consent.source / recorded_by, which is
--      where record_channel_invite() (00594:2258) and record_channel_consent()
--      (00622:240) actually write. Nothing in this file is needed for that; it
--      is named here because F2 and F3 below are the same rail.
--
--   F2 — sms_resolve_prompt and sms_grant_optin_prompt did not filter
--      voided_at. 00644 withdraws an open opt-in challenge when the seat's
--      phone is corrected under it, but a correct-then-REVERT (typo, then
--      undo) leaves the original handset reachable with the original code
--      still printed in the text it was sent — and `YES NN` from it GRANTED
--      consent against a question the studio had withdrawn (SQ-92
--      probe2b-void-revert.log). Both functions now refuse it.
--
--   F3 — sms_prompts.resend_evidence stored whatever keys the caller sent
--      (00644:410-415 merged p_evidence wholesale). The column is a
--      consent-evidence record, not a client scratchpad: its keys are now a
--      CHECKed subset, and resend_party_invite STRIPS rather than refuses, so
--      a client sending an extra still gets its resend.
--
-- Lineage:
--   sms_resolve_prompt        00639 → 00646 (this file)
--   sms_grant_optin_prompt    00639 → 00646 (this file)
--   resend_party_invite       00644 → 00646 (this file)
--   Each body below is the 00639/00644 body VERBATIM with the delta grafted on
--   (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/`
--   returns only those files), so no earlier fix is reverted.
--
-- Reconciles: nothing. 00645 redefines sms_prompt_reply_verb and
--   sms_apply_prompt, neither of which this file touches.
--
-- NO GRANT/REVOKE IN THIS FILE, deliberately: CREATE OR REPLACE FUNCTION keeps
-- the existing ACL, so 00639's and 00644's service_role-only / authenticated
-- grants stand unchanged and supabase/seed/00-legacy-grants.sql needs no
-- regeneration (contract P12 applies to migrations that ADD grants).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. F3 — the evidence columns have a SHAPE
-- ═══════════════════════════════════════════════════════════════════════════
-- The five keys are 00644's own documented shape for both columns
-- (sms_prompts.invite_evidence's COMMENT: "{ source, disclosure_version, note,
-- recorded_by, recorded_at }"). Stated as a CHECK so it binds every writer,
-- not only the RPC below — the prompt rows are service_role-only, but "the one
-- function that writes it is careful" is not a constraint.
--
-- CASE, not AND: Postgres may evaluate AND operands in either order, and
-- `jsonb - text[]` RAISES on a JSON scalar rather than returning false. The
-- CASE pins the order, so a non-object fails the check instead of aborting the
-- statement with a type error.
--
-- Empty after deleting the five allowed keys ⇒ it had no others. Existing rows
-- are unaffected: both columns arrived in 00644, which is applied nowhere but
-- disposable clones, so every row in every live database holds NULL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sms_prompts'::regclass
                 AND conname='sms_prompts_invite_evidence_keys_check') THEN
    ALTER TABLE public.sms_prompts ADD CONSTRAINT sms_prompts_invite_evidence_keys_check CHECK (
      invite_evidence IS NULL
      OR CASE WHEN jsonb_typeof(invite_evidence) = 'object'
              THEN invite_evidence - ARRAY['source', 'disclosure_version', 'note',
                                           'recorded_by', 'recorded_at'] = '{}'::jsonb
              ELSE false END);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sms_prompts'::regclass
                 AND conname='sms_prompts_resend_evidence_keys_check') THEN
    ALTER TABLE public.sms_prompts ADD CONSTRAINT sms_prompts_resend_evidence_keys_check CHECK (
      resend_evidence IS NULL
      OR CASE WHEN jsonb_typeof(resend_evidence) = 'object'
              THEN resend_evidence - ARRAY['source', 'disclosure_version', 'note',
                                           'recorded_by', 'recorded_at'] = '{}'::jsonb
              ELSE false END);
  END IF;
END $$;

COMMENT ON COLUMN public.sms_prompts.resend_evidence IS
  'The resend''s own evidence, same shape as invite_evidence. recorded_by and '
  'recorded_at are stamped by the RPC from auth.uid()/now(), never by the '
  'caller. Its KEYS are a CHECKed subset of { source, disclosure_version, '
  'note, recorded_by, recorded_at } (00646): resend_party_invite strips '
  'anything else the caller sent rather than refusing the resend, and the '
  'constraint binds every other writer. Write-once.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. F2 — a withdrawn challenge resolves to nothing, and grants nothing
-- ═══════════════════════════════════════════════════════════════════════════
-- THE HOLE, exactly (SQ-92 probe2b-void-revert.log): a designer fixes a typo in
-- the seat's phone — 00644's trigger withdraws the open challenge, correctly —
-- and then undoes the fix. The trigger only ever SETS voided_at; nothing
-- lowers it (it is write-once), which is right: the studio withdrew that
-- question and cannot un-ask it by retyping a number. But sms_resolve_prompt
-- filtered only answered_at and expires_at, so the code still printed in the
-- recipient's inbox resolved, and sms_grant_optin_prompt wrote a GRANT on the
-- consent record from it. The next ask is a NEW challenge with fresh evidence,
-- which is what 00644's header already says; these two clauses are what make
-- that true.
--
-- Both are stated, not just the resolver: the resolver is the inbound rail's
-- door, and the grant function is service_role-callable in its own right. A
-- gate that only one caller passes through is not a gate.

CREATE OR REPLACE FUNCTION public.sms_resolve_prompt(
  p_sender    TEXT,
  p_recipient TEXT,
  p_code      TEXT
)
RETURNS TABLE (
  id         UUID,
  project_id UUID,
  party_id   UUID,
  kind       TEXT,
  subject_id UUID,
  version    INTEGER,
  short_code TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.project_id, p.party_id, p.kind, p.subject_id, p.version,
         p.short_code, p.expires_at
    FROM public.sms_prompts p
   WHERE p.sender_number   = public.normalize_channel_value('sms', p_sender)
     AND p.recipient_phone = public.normalize_channel_value('sms', p_recipient)
     AND p.short_code      = NULLIF(regexp_replace(COALESCE(p_code, ''), '\D', '', 'g'), '')
     AND p.answered_at IS NULL
     -- 00646 (SQ-92 F2): a WITHDRAWN challenge is not a question anyone
     -- can answer. The seat's phone was corrected under it, so `Ref NN`
     -- from the OLD handset must resolve to nothing at all.
     AND p.voided_at IS NULL
     AND p.expires_at > now()
   ORDER BY p.created_at DESC
   LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.sms_grant_optin_prompt(
  p_prompt_id uuid, p_sender text, p_recipient text, p_sms_message_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.sms_prompts; m public.sms_messages; c public.studio_channel_consent;
  seat public.project_parties; result jsonb; verb text; accepted_at timestamptz;
BEGIN
  SELECT * INTO p FROM public.sms_prompts WHERE id=p_prompt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sms_prompt: unknown prompt' USING ERRCODE='23514'; END IF;
  m := public.sms_prompt_message(p,p_sender,p_recipient,p_sms_message_id);
  IF p.kind<>'optin' OR p.proposed_effect IS NOT NULL THEN
    RAISE EXCEPTION 'sms_grant_optin_prompt: optin only' USING ERRCODE='23514';
  END IF;
  IF p.consumed_sid=m.twilio_sid THEN
    RETURN jsonb_build_object('status','replayed','result',p.consumption_result);
  END IF;
  IF p.answered_at IS NOT NULL THEN RETURN jsonb_build_object('status','closed'); END IF;
  -- 00646 (SQ-92 F2): AND a WITHDRAWN one cannot grant. Read AFTER the SID
  -- replay above, so an answer that already committed still returns its own
  -- receipt, and before everything that could write. `closed` is the honest
  -- word and the one sms-inbound already answers with a closed-ref reply:
  -- the question was withdrawn, so there is nothing here to say yes to.
  IF p.voided_at IS NOT NULL THEN RETURN jsonb_build_object('status','closed'); END IF;
  IF p.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','expired'); END IF;
  verb := public.sms_prompt_reply_verb(p,m.body);
  IF verb NOT IN ('YES','Y') OR upper(btrim(m.body)) !~ ('^(YES|Y)[[:space:]]+'||p.short_code||'$') THEN
    RAISE EXCEPTION 'sms_prompt: optin requires coded YES/Y' USING ERRCODE='23514';
  END IF;
  SELECT * INTO c FROM public.studio_channel_consent
    WHERE organization_id=public.project_consent_org(p.project_id)
      AND channel_kind='sms' AND channel_value=p.recipient_phone FOR UPDATE;
  IF public.sms_is_suppressed(p.sender_number,p.recipient_phone) OR public.sms_phone_suppressed(p.recipient_phone) THEN
    RETURN jsonb_build_object('status','suppressed');
  END IF;
  IF c.status IS DISTINCT FROM 'pending' OR c.refusal_unanswered IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('status','not_pending');
  END IF;
  SELECT * INTO seat FROM public.project_parties WHERE id=p.party_id;
  IF NULLIF(btrim(COALESCE(c.disclosure_version,seat.sms_consent_disclosure_version)),'') IS NULL THEN
    RAISE EXCEPTION 'sms_prompt: disclosure evidence required' USING ERRCODE='23514';
  END IF;
  accepted_at := clock_timestamp();
  UPDATE public.studio_channel_consent SET status='granted',consented_at=accepted_at,
    recorded_at=accepted_at,source='inbound_sms',evidence=m.body,refusal_unanswered=false,
    origin_project_id=p.project_id,
    disclosure_version=COALESCE(c.disclosure_version,seat.sms_consent_disclosure_version),
    recorded_by=COALESCE(c.recorded_by,seat.sms_consent_recorded_by)
    WHERE organization_id=c.organization_id AND channel_kind='sms' AND channel_value=c.channel_value
    RETURNING * INTO c;
  IF c.status IS DISTINCT FROM 'granted' OR c.refusal_unanswered IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'sms_prompt: consent trigger refused acceptance' USING ERRCODE='23514';
  END IF;
  result := jsonb_build_object('kind','optin','result',jsonb_build_object(
    'organization_id',c.organization_id,'project_id',p.project_id,'party_id',p.party_id,
    'status',c.status,'consented_at',c.consented_at));
  UPDATE public.sms_prompts SET consumed_sid=m.twilio_sid,consumption_result=result,answered_at=clock_timestamp()
    WHERE id=p.id;
  RETURN jsonb_build_object('status','granted','result',result);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. F3 — resend_party_invite strips what the column will not hold
-- ═══════════════════════════════════════════════════════════════════════════
-- 00644's body verbatim, with ONE change: the caller's object is filtered to
-- the allowed keys before the four stamped ones are written over it. Every
-- gate, the advisory lock, the 24h floor, the one-per-version claim and the
-- record re-stamp are unchanged.

CREATE OR REPLACE FUNCTION public.resend_party_invite(
  p_party_id uuid,
  p_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_floor      interval := interval '24 hours';
  v_party      public.project_parties;
  v_org        uuid;
  v_phone      text;
  v_verdict    text;
  v_source     text;
  v_disclosure text;
  v_note       text;
  v_record_src text;
  v_challenge  public.sms_prompts;
  v_last       timestamptz;
  v_next       timestamptz;
  v_now        timestamptz := now();
  v_evidence   jsonb;
  v_request    bigint;
  v_dispatched boolean := false;
BEGIN
  IF p_party_id IS NULL THEN
    RAISE EXCEPTION 'resend_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialize this party before anything is read, so the floor and the
  -- allowance are decided on one state. Advisory locks nest, so a caller
  -- already holding it pays nothing.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('resend_party_invite:' || p_party_id::text, 0));

  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id FOR UPDATE;
  IF FOUND THEN
    v_org := public.project_consent_org(v_party.project_id);
  END IF;
  IF v_org IS NULL OR NOT public.is_active_studio_member(v_org) THEN
    -- One refusal for "no such seat", "not your studio", and "this project is
    -- attached to no studio at all": the caller learns nothing about a roster
    -- it may not read. SECURITY DEFINER, so RLS is not the backstop here.
    RAISE EXCEPTION 'resend_not_authorized'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Only an active member of the studio this project records its '
                   'consent in can send an invite again — and only for a seat on '
                   'one of its own projects.';
  END IF;

  -- ── The evidence, before any side effect ────────────────────────────────
  v_source     := btrim(COALESCE(p_evidence->>'source', ''));
  v_disclosure := btrim(COALESCE(p_evidence->>'disclosure_version', ''));
  v_note       := btrim(COALESCE(p_evidence->>'note', ''));
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
     OR v_source NOT IN ('verbal', 'form', 'kickoff')
     OR v_disclosure = '' OR v_note = '' THEN
    RAISE EXCEPTION 'resend_evidence_required'
      USING HINT = 'A resend needs how they said yes (verbal, form or kickoff), '
                   'the disclosure version they were read, and what happened in '
                   'words. Nothing is sent without it.';
  END IF;
  v_record_src := CASE v_source WHEN 'form' THEN 'web_form' ELSE 'verbal' END;

  v_phone := public.normalize_channel_value('sms', v_party.phone_e164);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'resend_no_phone_number'
      USING HINT = 'Add a phone number that can receive texts first.';
  END IF;

  -- ── GATE 1: suppression, first, as the send path orders it ──────────────
  IF public.sms_phone_suppressed(v_phone) THEN
    RAISE EXCEPTION 'resend_refused_suppressed'
      USING HINT = 'This number asked us to stop. Only they can undo that, by '
                   'replying START.';
  END IF;

  -- ── GATE 2: the record, which is the only grant ─────────────────────────
  v_verdict := public.channel_consent_status(v_org, 'sms', v_phone);
  IF v_verdict = 'granted' THEN
    RAISE EXCEPTION 'resend_already_granted'
      USING HINT = 'They already said yes, so there is nothing to ask again.';
  ELSIF v_verdict = 'opted_out' THEN
    RAISE EXCEPTION 'resend_refused_opted_out'
      USING HINT = 'This number''s refusal is on the record. Only they can '
                   'rejoin, by replying START.';
  ELSIF v_verdict IS NULL OR v_verdict = 'not_asked' THEN
    RAISE EXCEPTION 'resend_no_invite_on_file'
      USING HINT = 'Nobody has asked this number yet, so there is nothing to '
                   'send again. Record how they said yes and invite them.';
  END IF;

  -- ── The challenge this resend is about ──────────────────────────────────
  SELECT * INTO v_challenge
    FROM public.sms_prompts p
   WHERE p.party_id = p_party_id
     AND p.kind     = 'optin'
   ORDER BY p.version DESC, p.created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_challenge.answered_at IS NOT NULL THEN
    RAISE EXCEPTION 'resend_no_open_challenge'
      USING HINT = 'There is no question waiting on an answer here.';
  END IF;
  IF v_challenge.voided_at IS NOT NULL
     OR v_challenge.recipient_phone IS DISTINCT FROM v_phone THEN
    RAISE EXCEPTION 'resend_challenge_phone_changed'
      USING HINT = 'The number changed after they were asked, so the old '
                   'question is closed. Record how they said yes on the new '
                   'number and invite them again.';
  END IF;
  IF v_challenge.expires_at <= v_now THEN
    RAISE EXCEPTION 'resend_challenge_expired'
      USING HINT = 'That ask has run out. Inviting them again asks a new '
                   'question with a new reply code.';
  END IF;

  -- ── The floor, per party, across every generation of the ask ────────────
  SELECT max(GREATEST(p.created_at, COALESCE(p.resent_at, p.created_at)))
    INTO v_last
    FROM public.sms_prompts p
   WHERE p.party_id = p_party_id AND p.kind = 'optin';
  v_next := v_last + v_floor;
  IF v_next > v_now THEN
    RAISE EXCEPTION 'resend_floor_not_elapsed'
      USING DETAIL = 'next_allowed_at=' || to_char(v_next, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
            HINT = 'They were asked less than a day ago. Give them a day before '
                   'asking again.';
  END IF;

  -- ── THE CLAIM. One resend per challenge version, whoever clicks ─────────
  -- 00646 (SQ-92 F3): STRIP, never refuse. Whatever else the caller put in
  -- p_evidence is not evidence, and sms_prompts is not free storage for it;
  -- but a client that sends a stray key has still told us how they said
  -- yes, so the extras are dropped rather than the resend. The column's own
  -- CHECK (sms_prompts_resend_evidence_keys_check) is the backstop for any
  -- writer that is not this function.
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    INTO v_evidence
    FROM jsonb_each(COALESCE(p_evidence, '{}'::jsonb)) AS e
   WHERE e.key IN ('source', 'disclosure_version', 'note',
                   'recorded_by', 'recorded_at');
  v_evidence := v_evidence
                || jsonb_build_object('source', v_source,
                                      'disclosure_version', v_disclosure,
                                      'note', v_note,
                                      'recorded_by', auth.uid(),
                                      'recorded_at', v_now);
  UPDATE public.sms_prompts p
     SET resent_at       = v_now,
         resent_by       = auth.uid(),
         resend_evidence = v_evidence
   WHERE p.id          = v_challenge.id
     AND p.resent_at   IS NULL
     AND p.voided_at   IS NULL
     AND p.answered_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resend_already_sent'
      USING HINT = 'This question has already been asked again once. Inviting '
                   'them after that asks a new one.';
  END IF;

  -- ── A fresh consent stamp, so the one new send can take a claim ─────────
  -- The existing door, with every gate it has: studio membership, the
  -- normalizer, the refusal legs, and the standing-grant leg that would have
  -- refused above already.
  PERFORM public.record_channel_invite(
    v_org, 'sms', v_phone, v_record_src, v_note, v_disclosure, v_party.project_id);

  -- ── The send, on the existing rail, declaring its phase ─────────────────
  -- invoke_edge_function returns NULL (with its own warning) when this database
  -- carries no edge settings, so `dispatched` says whether a request actually
  -- left rather than whether the call returned.
  BEGIN
    v_request := public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',         p_party_id,
        'projectId',       v_party.project_id,
        'templateKey',     'sms_optin_invite',
        'type',            'field_optin_invite',
        -- THIS challenge's code: a resend re-asks the same question, so the
        -- recipient's `YES NN` still resolves the row they were first sent.
        'code',            v_challenge.short_code,
        'automationPhase', 1));
    v_dispatched := v_request IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    v_dispatched := false;
    RAISE WARNING 'resend_party_invite: dispatch failed for party %: %',
      p_party_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status',          'queued',
    'party_id',        p_party_id,
    'project_id',      v_party.project_id,
    'challenge_id',    v_challenge.id,
    'version',         v_challenge.version,
    'resent_at',       v_now,
    'next_allowed_at', v_now + v_floor,
    'dispatched',      v_dispatched);
END;
$$;
