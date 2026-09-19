-- 00644 — The Field Line, Phase 1 (P1-01): consent evidence on the challenge,
-- and the ONE owner of an SMS invite resend.
--
-- Lineage: consent record 00594 -> 00622 (studio_channel_consent is the ONLY
-- grant; project_parties.sms_consent_* is frozen at 00594:854). Prompt/consent
-- challenge authority 00639 (sms_prompts kind='optin', sms_create_prompt,
-- sms_suppressions). Dispatch + send claim 00640. Invite copy 00641.
--
-- WHERE THE EVIDENCE GOES, AND WHY (contract US-2 P1, and the deliverable's
-- "say which"). The CONSENT RECORD already carries the whole evidence set —
-- studio_channel_consent.source / evidence / recorded_at / recorded_by /
-- disclosure_version (00594:195, written by record_channel_consent at
-- 00622:240) — so NOTHING is added there, and nothing is ever written to
-- project_parties. What had no home was the evidence for a RESEND of one
-- particular challenge: which member re-asked, when, on what authority, and
-- against which disclosure the person was read. That goes on the OPTIN PROMPT
-- ROW, because the prompt IS the challenge (00639's comment on the table) and
-- the resend allowance is a fact about that one ask, not about the record.
--
-- WHY A RESEND NEEDS A FRESH CONSENT STAMP. sendPartySms keys the invite's send
-- claim on the record's own evidence stamp — `optin:<recorded_at>` (_shared/
-- sms.ts:1434, claimed by sms_messages_send_claim_uniq, 00640:322). A second
-- invite on the same stamp loses that claim and texts nobody, which is exactly
-- right for a retry and exactly wrong for a designer's deliberate "send again".
-- So the resend re-stamps the record through record_channel_invite() — the
-- existing door, every gate of it — and that new generation is what earns the
-- ONE new send. The resend allowance below is what bounds it to one.
--
-- PHASE GATE. The dispatch this function triggers declares automation_phase 1,
-- so sendPartySms' GATE 3 (fieldLinePhase(), _shared/sms.ts:198 / :1416) refuses
-- it as `field_line_phase_off` until the owner sets FIELD_LINE_PHASE >= 1. This
-- migration can therefore be applied with the rail still off.
--
-- No new table, so S12's REVOKE stanza lands on the new FUNCTIONS: every one of
-- them is revoked from PUBLIC and anon, and only the designer-facing RPC is
-- granted to authenticated.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The challenge row carries its own evidence, its void, and ONE resend
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sms_prompts
  ADD COLUMN IF NOT EXISTS invite_evidence jsonb,
  ADD COLUMN IF NOT EXISTS resent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS resent_by       uuid,
  ADD COLUMN IF NOT EXISTS resend_evidence jsonb,
  ADD COLUMN IF NOT EXISTS voided_at       timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason     text;

-- resent_by is a plain uuid, like sms_messages.owner_user_id (00642): the
-- prompt tables sit outside the auth graph on purpose, and a member leaving the
-- studio must not cascade away the record of who re-asked.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sms_prompts'::regclass
                 AND conname='sms_prompts_resend_check') THEN
    ALTER TABLE public.sms_prompts ADD CONSTRAINT sms_prompts_resend_check CHECK (
      (resent_at IS NULL AND resent_by IS NULL AND resend_evidence IS NULL)
      OR (resent_at IS NOT NULL AND resent_by IS NOT NULL
          AND jsonb_typeof(resend_evidence) = 'object'
          AND (resend_evidence ? 'source') AND (resend_evidence ? 'disclosure_version')
          AND (resend_evidence ? 'recorded_by') AND (resend_evidence ? 'recorded_at')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sms_prompts'::regclass
                 AND conname='sms_prompts_void_check') THEN
    ALTER TABLE public.sms_prompts ADD CONSTRAINT sms_prompts_void_check CHECK (
      (voided_at IS NULL AND void_reason IS NULL)
      OR (voided_at IS NOT NULL AND btrim(COALESCE(void_reason,'')) <> ''));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sms_prompts'::regclass
                 AND conname='sms_prompts_void_not_resent_check') THEN
    -- A voided challenge is a question we withdrew. It can never be re-asked.
    ALTER TABLE public.sms_prompts ADD CONSTRAINT sms_prompts_void_not_resent_check CHECK (
      voided_at IS NULL OR resent_at IS NULL OR resent_at <= voided_at);
  END IF;
END $$;

COMMENT ON COLUMN public.sms_prompts.invite_evidence IS
  'The Field Line (00644, contract US-2 P1): the evidence the FIRST ask stood '
  'on — { source: verbal|form|kickoff, disclosure_version, note, recorded_by, '
  'recorded_at }, the contract''s source vocabulary kept VERBATIM. The consent '
  'record (studio_channel_consent) is still the grant and still carries its own '
  'evidence set; this is the copy bound to this one challenge. Write-once.';
COMMENT ON COLUMN public.sms_prompts.resent_at IS
  'The Field Line (00644, contract US-2 P2): when resend_party_invite() re-asked '
  'THIS challenge. Write-once, and the whole of "at most one resend per '
  'challenge version" — the version IS the row (sms_prompts_open_optin_uniq is '
  'UNIQUE (party_id, version)), so a conditional UPDATE on resent_at IS NULL is '
  'the claim two concurrent callers race for. Also the 24h floor''s clock.';
COMMENT ON COLUMN public.sms_prompts.resend_evidence IS
  'The resend''s own evidence, same shape as invite_evidence. recorded_by and '
  'recorded_at are stamped by the RPC from auth.uid()/now(), never by the '
  'caller; everything else the caller sent is kept verbatim. Write-once.';
COMMENT ON COLUMN public.sms_prompts.voided_at IS
  'The Field Line (00644): the challenge was WITHDRAWN before it was answered — '
  'today only because the seat''s phone was corrected under it (void_reason '
  '''phone_corrected''), which is the one way a live ask stops being a question '
  'this person can answer. Distinct from answered_at, which is a reply, and '
  'from expires_at, which is time running out. A voided challenge cannot be '
  'resent; a new ask needs fresh evidence. Write-once.';

-- ── The immutable binding, plus the write-once facts above ──────────────────
-- 00639:638's body verbatim, with three additive clauses. The "at most one
-- resend" claim rests entirely on resent_at not being rewritable, so it is
-- enforced here rather than asserted in a comment — the same reason 00639 put
-- answered_at and the receipt here.
CREATE OR REPLACE FUNCTION public.sms_prompts_guard_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id      IS DISTINCT FROM OLD.project_id
     OR NEW.party_id        IS DISTINCT FROM OLD.party_id
     OR NEW.sender_number   IS DISTINCT FROM OLD.sender_number
     OR NEW.recipient_phone IS DISTINCT FROM OLD.recipient_phone
     OR NEW.kind            IS DISTINCT FROM OLD.kind
     OR NEW.subject_id      IS DISTINCT FROM OLD.subject_id
     OR NEW.version         IS DISTINCT FROM OLD.version
     OR NEW.short_code      IS DISTINCT FROM OLD.short_code
     OR NEW.expires_at      IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at
     OR NEW.proposed_effect IS DISTINCT FROM OLD.proposed_effect THEN
    RAISE EXCEPTION
      'sms_prompts: the prompt binding (party/project/kind/subject/version/code/expiry) is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
    RAISE EXCEPTION 'sms_prompts: answered_at is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (OLD.consumed_sid IS NOT NULL OR OLD.answered_at IS NOT NULL)
     AND (NEW.consumed_sid IS DISTINCT FROM OLD.consumed_sid
          OR NEW.consumption_result IS DISTINCT FROM OLD.consumption_result) THEN
    RAISE EXCEPTION 'sms_prompts: receipt is write-once; cancellation is not consumption'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.code_reserved AND NOT OLD.code_reserved THEN
    RAISE EXCEPTION 'sms_prompts: a released short code cannot be re-reserved'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00644: the evidence a challenge was asked on is a fact the audit keeps.
  IF OLD.invite_evidence IS NOT NULL
     AND NEW.invite_evidence IS DISTINCT FROM OLD.invite_evidence THEN
    RAISE EXCEPTION 'sms_prompts: invite_evidence is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00644: ONE resend per challenge version. A second writer — service role
  -- included — cannot reopen the allowance by rewriting the stamp.
  IF OLD.resent_at IS NOT NULL
     AND (NEW.resent_at IS DISTINCT FROM OLD.resent_at
          OR NEW.resent_by IS DISTINCT FROM OLD.resent_by
          OR NEW.resend_evidence IS DISTINCT FROM OLD.resend_evidence) THEN
    RAISE EXCEPTION 'sms_prompts: the resend is write-once — one per challenge version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00644: a withdrawn question stays withdrawn.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.voided_at IS DISTINCT FROM OLD.voided_at
          OR NEW.void_reason IS DISTINCT FROM OLD.void_reason) THEN
    RAISE EXCEPTION 'sms_prompts: voided_at is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_prompts_guard_binding() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_prompts_guard_binding() IS
  'BEFORE UPDATE on sms_prompts (00639, extended 00644): enforces contract S1''s '
  'immutable binding and proposal. Receipt/SID/answered_at are write-once '
  'together; code_reserved (true->false) may move, so no code path — service '
  'role included — can retarget a live ref. 00644 adds the three write-once '
  'facts Phase 1 rests on: invite_evidence, the single resend stamp (resent_at / '
  'resent_by / resend_evidence), and voided_at.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Correcting the phone invalidates the challenge under it
-- ═══════════════════════════════════════════════════════════════════════════
-- A challenge is a question sent to ONE handset and answered by a `YES NN` from
-- that handset. Correct the seat's number and the open ask is no longer a
-- question the person in front of the designer can answer — so it is withdrawn
-- here, at the write that moved the number, rather than left open to hold its
-- ref code and its resend allowance for a phone nobody will text again.
--
-- This is a DATABASE fact, not a portal convention: useUpdateProjectParty is
-- not the only writer of project_parties.phone, and the consent record is
-- already reverted on a phone edit by the existing surfaces.
--
-- It composes with ensureOptinCode (sms-dispatch/handler.ts:225) rather than
-- fighting it: that reader already skips an open challenge whose recipient no
-- longer matches the seat and mints the NEXT version, so nothing here changes
-- which ask a reply resolves, and sms_prompts_open_optin_uniq's predicate is
-- untouched (a voided row is only ever a stale-phone row, which that reader
-- passed over already).
CREATE OR REPLACE FUNCTION public.sms_void_stale_optin_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone_e164 IS NOT DISTINCT FROM OLD.phone_e164 THEN
    RETURN NULL;
  END IF;

  UPDATE public.sms_prompts p
     SET voided_at   = now(),
         void_reason = 'phone_corrected'
   WHERE p.party_id    = NEW.id
     AND p.kind        = 'optin'
     AND p.answered_at IS NULL
     AND p.voided_at   IS NULL
     AND p.recipient_phone
         IS DISTINCT FROM public.normalize_channel_value('sms', NEW.phone_e164);

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_void_stale_optin_challenges()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_void_stale_optin_challenges() IS
  'AFTER UPDATE OF phone/phone_e164 on project_parties (00644, contract US-2 '
  'P2): withdraws every OPEN opt-in challenge whose recipient is no longer this '
  'seat''s number. SECURITY DEFINER because sms_prompts is service-role only '
  'while the phone edit is an authenticated designer act. A withdrawn challenge '
  'cannot be resent — the next ask is a new challenge with fresh evidence.';

DROP TRIGGER IF EXISTS sms_void_stale_optin_challenges_trg ON public.project_parties;
CREATE TRIGGER sms_void_stale_optin_challenges_trg
  AFTER UPDATE OF phone, phone_e164 ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.sms_void_stale_optin_challenges();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. resend_party_invite — the ONE owner of an SMS invite resend
-- ═══════════════════════════════════════════════════════════════════════════
-- Contract US-2 P2. Every "Send again" in the portal, and every automation that
-- ever wants one, comes through here; there is no parallel path. What it owns:
--
--   · WHO — an active, non-guest member of the studio the party's project
--     records its consent in (project_consent_org + is_active_studio_member,
--     the same authority as the consent doors themselves). A caller outside
--     that studio, and a party that does not exist, get the SAME refusal, so
--     this function is not an existence oracle for another studio's roster.
--   · WHETHER — suppression first, exactly as the send path orders its gates
--     (00639's fold and _shared/sms.ts' GATE 1), then the record: a granted
--     record has nothing to re-ask, an opted-out one may not be asked at all,
--     and no record at all is not a resend but a first invite.
--   · HOW OFTEN — a 24h floor per party, and at most ONE resend per challenge
--     version. Both are read off sms_prompts, and the second is CLAIMED by a
--     conditional UPDATE under an advisory lock on the party, so two clicks a
--     millisecond apart produce one resend and one refusal, not two texts.
--   · ON WHAT AUTHORITY — the evidence is required, and stamped with the
--     recorder (auth.uid()) and the moment (now()) by this function, never by
--     the caller. The contract's source vocabulary (verbal / form / kickoff) is
--     kept VERBATIM on the challenge; the consent record's own `source` column
--     takes the nearest value its 00594 CHECK allows (kickoff and verbal are
--     both spoken consent, so both record as 'verbal'; form records as
--     'web_form') — the verbatim word is never lost, it is just not the column
--     that constrains it.
--
-- The dispatch itself is the existing rail: sms-dispatch with the invite
-- template and THIS challenge's short code, declaring automation_phase 1. The
-- fresh record stamp from record_channel_invite() is what lets that send take a
-- claim at all (see the header). A transport failure is warned, not raised, the
-- way 00284's dispatch triggers do: the allowance is spent and the floor holds,
-- which bounds sends at the cost of a designer waiting out the floor. Bounding
-- the sends is the promise this rail makes to the recipient.
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
  v_evidence := COALESCE(p_evidence, '{}'::jsonb)
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

REVOKE ALL ON FUNCTION public.resend_party_invite(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_party_invite(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.resend_party_invite(uuid, jsonb) IS
  'The Field Line (00644), contract US-2 P2: the ONE owner of an SMS invite '
  'resend. Studio-member gated on the party''s own project (one refusal for a '
  'foreign or absent seat, so it is no existence oracle); refuses a granted '
  'record, a suppressed handset and a recorded refusal; 24h floor per party; at '
  'most one resend per challenge version, claimed by a conditional UPDATE under '
  'an advisory lock so concurrent callers produce one send; records the '
  'recorder, the moment, the source (verbal|form|kickoff, verbatim) and the '
  'disclosure version on the challenge row; a corrected phone voids the '
  'challenge (sms_void_stale_optin_challenges) and the next ask needs fresh '
  'evidence. Re-stamps the consent record through record_channel_invite() so '
  'the invite earns exactly one new send claim, then dispatches sms-dispatch '
  'with THIS challenge''s code and automation_phase 1 — which the server phase '
  'gate refuses until FIELD_LINE_PHASE >= 1. Returns a jsonb receipt. Nothing '
  'is ever written to project_parties.sms_consent_* (frozen, 00594:854).';
