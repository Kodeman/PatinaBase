-- Standalone, synthetic, rolled back; run only in the disposable controller DB.
-- 00644 (P1-01): resend_party_invite is the ONE owner of an SMS invite resend.
--
-- What is proved here: one send per challenge version under a double call, the
-- 24h floor with its reason, a corrected phone withdrawing the challenge under
-- it, a cross-studio caller learning nothing, the three record refusals, and
-- the privilege level of everything 00644 adds. Nothing reaches a provider from
-- SQL — the dispatch is invoke_edge_function, which this database has no
-- settings for and which warns and returns NULL.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email) VALUES
 ('64000000-0000-4000-8000-000000000001','sq11-a@test.invalid'),
 ('64000000-0000-4000-8000-000000000002','sq11-b@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES
 ('64000000-0000-4000-8000-000000000001','sq11-a@test.invalid','SQ11 designer A'),
 ('64000000-0000-4000-8000-000000000002','sq11-b@test.invalid','SQ11 designer B')
 ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('64000000-0000-4000-8000-000000000010','design_studio','SQ11 studio','sq11-studio','active'),
 ('64000000-0000-4000-8000-000000000011','design_studio','SQ11 other studio','sq11-other','active');
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000010','owner','active'),
 ('64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000011','owner','active');
INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('64000000-0000-4000-8000-000000000020','SQ11 project',
  '64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000010'),
 ('64000000-0000-4000-8000-000000000021','SQ11 other project',
  '64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-000000000011');

-- One seat per case, so no case can move another's state.
--   b1 happy path + double call      b5 granted record
--   b2 floor + evidence gate         b6 foreign studio's seat
--   b3 phone corrected               b7 no phone at all
--   b4 suppressed handset            b8 challenge already answered
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('64000000-0000-4000-8000-0000000000b1','64000000-0000-4000-8000-000000000020','sub','SQ11 Drywaller','+15556440001'),
 ('64000000-0000-4000-8000-0000000000b2','64000000-0000-4000-8000-000000000020','sub','SQ11 Painter','+15556440002'),
 ('64000000-0000-4000-8000-0000000000b3','64000000-0000-4000-8000-000000000020','sub','SQ11 Plumber','+15556440003'),
 ('64000000-0000-4000-8000-0000000000b4','64000000-0000-4000-8000-000000000020','sub','SQ11 Tiler','+15556440004'),
 ('64000000-0000-4000-8000-0000000000b5','64000000-0000-4000-8000-000000000020','sub','SQ11 Glazier','+15556440005'),
 ('64000000-0000-4000-8000-0000000000b6','64000000-0000-4000-8000-000000000021','sub','SQ11 Foreign','+15556440006'),
 ('64000000-0000-4000-8000-0000000000b7','64000000-0000-4000-8000-000000000020','sub','SQ11 Unreachable',NULL),
 ('64000000-0000-4000-8000-0000000000b8','64000000-0000-4000-8000-000000000020','sub','SQ11 Answered','+15556440008'),
 ('64000000-0000-4000-8000-0000000000b9','64000000-0000-4000-8000-000000000020','sub','SQ11 Asked twice','+15556440009'),
 -- 00646 (SQ-92 F2/F3): c0 corrects its number and corrects it BACK; c1 is
 -- the same shape with nothing withdrawn, so the void clause is shown to be
 -- what refuses rather than some other gate, and afterwards c1 carries F3's
 -- direct writes. c2 is F3's resend, which must SUCCEED with extras stripped.
 ('64000000-0000-4000-8000-0000000000c0','64000000-0000-4000-8000-000000000020','sub','SQ11 Reverted','+15556440010'),
 ('64000000-0000-4000-8000-0000000000c1','64000000-0000-4000-8000-000000000020','sub','SQ11 Untouched','+15556440011'),
 ('64000000-0000-4000-8000-0000000000c2','64000000-0000-4000-8000-000000000020','sub','SQ11 Extra keys','+15556440012');

-- The handset threads the inbound `YES NN` arrives on (00639's endpoint check
-- reads the conversation's own pair, not the reply's).
INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('64000000-0000-4000-8000-0000000000e0','+15556449999','+15556440010'),
 ('64000000-0000-4000-8000-0000000000e1','+15556449999','+15556440011');

-- The record is the only grant (00594/00622). Every seat below is mid-double-
-- opt-in (`pending`) except b5, which already said yes.
INSERT INTO studio_channel_consent
 (organization_id,channel_kind,channel_value,status,source,evidence,disclosure_version,recorded_by,recorded_at)
VALUES
 ('64000000-0000-4000-8000-000000000010','sms','+15556440001','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440002','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '2 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440003','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 -- the corrected number, already asked, so the challenge gate is what answers
 ('64000000-0000-4000-8000-000000000010','sms','+15556449003','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440004','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440005','granted','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440008','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440009','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '40 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440010','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 -- the number b10 is briefly corrected TO, so the correction is a real edit
 ('64000000-0000-4000-8000-000000000010','sms','+15556449010','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440011','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000010','sms','+15556440012','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000001',now()-interval '30 hours'),
 ('64000000-0000-4000-8000-000000000011','sms','+15556440006','pending','verbal','Said yes on the phone','field-sms-v1','64000000-0000-4000-8000-000000000002',now()-interval '30 hours');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.assume_user_role(p_user_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE FUNCTION pg_temp.reset_role() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',NULL,true);
END $$;

-- A challenge is an sms_prompts row kind='optin' (00639). Inserted directly so
-- its created_at can be BACKDATED — the 24h floor's clock is that column, and
-- sms_create_prompt (rightly) will not let a caller choose it. Case A below
-- still proves the real allocator writes a row this function accepts.
-- p_resent stamps a challenge that has ALREADY been re-asked once, which no
-- UPDATE could do afterwards (the resend stamp is write-once by design).
CREATE FUNCTION pg_temp.challenge(
  p_party uuid, p_recipient text, p_age interval,
  p_code text DEFAULT '11', p_answered boolean DEFAULT false,
  p_resent interval DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_evidence jsonb;
BEGIN
  v_evidence := jsonb_build_object('source','verbal','disclosure_version','field-sms-v1',
      'note','Said yes on the phone','recorded_by','64000000-0000-4000-8000-000000000001',
      'recorded_at',now()-p_age);
  INSERT INTO public.sms_prompts
    (id,project_id,party_id,sender_number,recipient_phone,kind,subject_id,version,
     short_code,expires_at,created_at,answered_at,invite_evidence,
     resent_at,resent_by,resend_evidence)
  VALUES (v_id,(SELECT project_id FROM public.project_parties WHERE id=p_party),
    p_party,'+15556449999',p_recipient,'optin',NULL,1,
    p_code,now()+interval '14 days',now()-p_age,
    CASE WHEN p_answered THEN now()-p_age+interval '1 minute' END,
    v_evidence,
    CASE WHEN p_resent IS NOT NULL THEN now()-p_resent END,
    CASE WHEN p_resent IS NOT NULL THEN '64000000-0000-4000-8000-000000000001'::uuid END,
    CASE WHEN p_resent IS NOT NULL THEN v_evidence END);
  RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.evidence(p_source text DEFAULT 'verbal') RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('source',p_source,'disclosure_version','field-sms-v1',
                            'note','They said yes on the phone');
$$;

-- Every refusal is asserted the same way: the named token, AND that the rail
-- is exactly as it was — no resend stamp, no consent stamp moved, no seat row
-- touched. A refusal that leaves a claim spent is not a refusal.
CREATE FUNCTION pg_temp.refuses(
  p_user uuid, p_party uuid, p_evidence jsonb, p_token text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_prompts jsonb; v_consent jsonb; v_parties jsonb; v_failed boolean := false;
  v_message text;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO v_prompts FROM public.sms_prompts t;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]') INTO v_consent FROM public.studio_channel_consent t;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO v_parties FROM public.project_parties t;
  PERFORM pg_temp.assume_user_role(p_user);
  BEGIN
    PERFORM public.resend_party_invite(p_party,p_evidence);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_failed, p_token||': refused';
  ASSERT v_message LIKE '%'||p_token||'%', p_token||': named, got '||COALESCE(v_message,'<none>');
  ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]')=v_prompts FROM public.sms_prompts t),
    p_token||': no prompt touched';
  ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]')=v_consent FROM public.studio_channel_consent t),
    p_token||': no consent record touched';
  ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]')=v_parties FROM public.project_parties t),
    p_token||': no seat row touched';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A · Double call → ONE resend. The claim is the challenge row.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_challenge uuid; v_result jsonb; v_before timestamptz; v_after timestamptz;
  v_failed boolean := false; v_message text; v_alloc uuid; v_code text;
BEGIN
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000b1','+15556440001',interval '30 hours');
  SELECT recorded_at INTO v_before FROM public.studio_channel_consent
   WHERE organization_id='64000000-0000-4000-8000-000000000010' AND channel_kind='sms'
     AND channel_value='+15556440001';

  PERFORM pg_temp.assume_user_role('64000000-0000-4000-8000-000000000001');
  v_result := public.resend_party_invite('64000000-0000-4000-8000-0000000000b1', pg_temp.evidence());
  ASSERT v_result->>'status'='queued', 'A: the resend is queued';
  ASSERT (v_result->>'challenge_id')::uuid = v_challenge, 'A: it re-asks the open challenge';
  ASSERT (v_result->>'version')::int = 1, 'A: at the challenge''s own version';
  ASSERT v_result ? 'next_allowed_at', 'A: the receipt carries the next allowed moment';

  -- THE ONE SEND: a second call in the same breath spends nothing. The floor's
  -- clock is the resend that just landed, so the floor is what answers here —
  -- case A2 below is where the per-version allowance answers on its own.
  BEGIN
    PERFORM public.resend_party_invite('64000000-0000-4000-8000-0000000000b1', pg_temp.evidence());
  EXCEPTION WHEN OTHERS THEN v_failed := true; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_failed, 'A: the second call is refused';
  ASSERT v_message LIKE '%resend_floor_not_elapsed%', 'A: and says so, got '||COALESCE(v_message,'<none>');
  ASSERT (SELECT count(*) FROM public.sms_prompts
           WHERE party_id='64000000-0000-4000-8000-0000000000b1' AND resent_at IS NOT NULL)=1,
    'A: exactly one resend stamp for this party';
  ASSERT (SELECT count(*) FROM public.sms_prompts
           WHERE party_id='64000000-0000-4000-8000-0000000000b1')=1,
    'A: and no second challenge was opened behind it';

  -- The evidence is on the challenge, verbatim, with the recorder the server
  -- stamped rather than the one the caller might have claimed.
  ASSERT (SELECT resend_evidence->>'source'='verbal'
                 AND resend_evidence->>'disclosure_version'='field-sms-v1'
                 AND resend_evidence->>'note'='They said yes on the phone'
                 AND (resend_evidence->>'recorded_by')::uuid='64000000-0000-4000-8000-000000000001'
                 AND resend_evidence ? 'recorded_at'
                 AND resent_by='64000000-0000-4000-8000-000000000001'
            FROM public.sms_prompts WHERE id=v_challenge),
    'A: recorder, moment, source and disclosure version on the challenge';

  -- The consent record's stamp moved — that generation is what lets the invite
  -- take a send claim at all (_shared/sms.ts:1434).
  SELECT recorded_at INTO v_after FROM public.studio_channel_consent
   WHERE organization_id='64000000-0000-4000-8000-000000000010' AND channel_kind='sms'
     AND channel_value='+15556440001';
  ASSERT v_after > v_before, 'A: the consent record carries a fresh evidence stamp';
  ASSERT (SELECT status='pending' FROM public.studio_channel_consent
           WHERE organization_id='64000000-0000-4000-8000-000000000010'
             AND channel_kind='sms' AND channel_value='+15556440001'),
    'A: and is still only pending — the resend does not grant anything';

  -- The real allocator writes a row this function reads the same way.
  SELECT id, short_code INTO v_alloc, v_code FROM public.sms_create_prompt(
    '64000000-0000-4000-8000-0000000000b2','64000000-0000-4000-8000-000000000020',
    'optin',NULL,1,now()+interval '7 days','+15556449999','+15556440002');
  ASSERT v_code ~ '^[0-9]{2,3}$', 'A: sms_create_prompt still allocates a ref code';
  ASSERT (SELECT resent_at IS NULL AND voided_at IS NULL AND resend_evidence IS NULL
            FROM public.sms_prompts WHERE id=v_alloc),
    'A: a freshly minted challenge carries no resend and no void';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A2 · At most ONE resend per challenge version, floor or no floor
-- ═══════════════════════════════════════════════════════════════════════════
-- b9's challenge was asked 40h ago and re-asked 30h ago, so the 24h floor has
-- elapsed and the ONLY thing standing between the designer and a third text is
-- the allowance on the challenge row — the same conditional UPDATE two
-- concurrent callers race for.
DO $$ BEGIN
  PERFORM pg_temp.challenge('64000000-0000-4000-8000-0000000000b9','+15556440009',
    interval '40 hours','17',false,interval '30 hours');
END $$;
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b9',pg_temp.evidence(),'resend_already_sent');

-- ═══════════════════════════════════════════════════════════════════════════
-- B · The 24h floor, and the evidence gate in front of it
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_failed boolean := false; v_detail text; v_hint text;
BEGIN
  -- b2's challenge was minted by case A's allocator two statements ago, so its
  -- created_at is now() — inside the floor by construction.
  PERFORM pg_temp.assume_user_role('64000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.resend_party_invite('64000000-0000-4000-8000-0000000000b2', pg_temp.evidence());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    ASSERT SQLERRM LIKE '%resend_floor_not_elapsed%', 'B: the floor refuses by name, got '||SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_failed, 'B: inside the floor, nothing is sent';
  ASSERT v_detail LIKE 'next_allowed_at=%', 'B: the refusal carries when, got '||COALESCE(v_detail,'<none>');
  ASSERT v_hint LIKE '%day%', 'B: and a reason in plain words, got '||COALESCE(v_hint,'<none>');
  ASSERT (SELECT resent_at IS NULL FROM public.sms_prompts
           WHERE party_id='64000000-0000-4000-8000-0000000000b2'),
    'B: the allowance is untouched by a refusal';
END $$;

-- Nothing sends without evidence, and the evidence gate is asked BEFORE the
-- floor — a designer with nothing written down is told what to write down.
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b2','{}'::jsonb,'resend_evidence_required');
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b2',
  jsonb_build_object('source','other','disclosure_version','field-sms-v1','note','x'),
  'resend_evidence_required');
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b2',
  jsonb_build_object('source','verbal','disclosure_version','','note','x'),
  'resend_evidence_required');
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b2',
  jsonb_build_object('source','verbal','disclosure_version','field-sms-v1','note','  '),
  'resend_evidence_required');

-- ═══════════════════════════════════════════════════════════════════════════
-- C · Correcting the phone withdraws the challenge under it
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_challenge uuid; v_failed boolean := false;
BEGIN
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000b3','+15556440003',interval '30 hours','12');
  ASSERT (SELECT voided_at IS NULL FROM public.sms_prompts WHERE id=v_challenge),
    'C: the challenge starts open';

  UPDATE public.project_parties SET phone='+15556449003'
   WHERE id='64000000-0000-4000-8000-0000000000b3';

  ASSERT (SELECT voided_at IS NOT NULL AND void_reason='phone_corrected'
            FROM public.sms_prompts WHERE id=v_challenge),
    'C: the phone edit withdraws the open challenge';
  ASSERT (SELECT answered_at IS NULL FROM public.sms_prompts WHERE id=v_challenge),
    'C: withdrawn is not answered';

  -- A withdrawn challenge is not resendable, even with a consent record on the
  -- new number: the next ask is a NEW challenge on fresh evidence.
  PERFORM pg_temp.refuses('64000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-0000000000b3',pg_temp.evidence(),'resend_challenge_phone_changed');

  -- And the withdrawal is write-once, service role or not.
  BEGIN
    UPDATE public.sms_prompts SET voided_at=now(), void_reason='again' WHERE id=v_challenge;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'C: voided_at is write-once';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D · A caller outside the studio learns nothing at all
-- ═══════════════════════════════════════════════════════════════════════════
-- Same refusal for a foreign studio's seat and for a seat that does not exist,
-- so this RPC cannot be walked as an existence oracle over another roster.
DO $$ BEGIN
  PERFORM pg_temp.challenge('64000000-0000-4000-8000-0000000000b6','+15556440006',interval '30 hours','13');
END $$;
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b6',pg_temp.evidence(),'resend_not_authorized');
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000bf',pg_temp.evidence(),'resend_not_authorized');
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  NULL,pg_temp.evidence(),'resend_not_authorized');
-- The other studio's own member still may not reach a seat on OUR project.
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000002',
  '64000000-0000-4000-8000-0000000000b1',pg_temp.evidence(),'resend_not_authorized');

-- ═══════════════════════════════════════════════════════════════════════════
-- E · Suppression beats the record, and is asked first
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  PERFORM pg_temp.challenge('64000000-0000-4000-8000-0000000000b4','+15556440004',interval '30 hours','14');
  INSERT INTO public.sms_suppressions(sender_number,recipient_phone,reason)
  VALUES ('+15556449999','+15556440004','stop');
END $$;
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b4',pg_temp.evidence(),'resend_refused_suppressed');

-- ═══════════════════════════════════════════════════════════════════════════
-- F · The record's own three answers
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  PERFORM pg_temp.challenge('64000000-0000-4000-8000-0000000000b5','+15556440005',interval '30 hours','15');
  PERFORM pg_temp.challenge('64000000-0000-4000-8000-0000000000b8','+15556440008',interval '30 hours','16',true);
END $$;
-- Already said yes: there is nothing to ask again.
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b5',pg_temp.evidence(),'resend_already_granted');
-- No number to text.
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b7',pg_temp.evidence(),'resend_no_phone_number');
-- The question was answered; a resend has nothing open to re-ask.
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b8',pg_temp.evidence(),'resend_no_open_challenge');
-- A recorded refusal, and the absence of any record, are different facts.
DO $$ BEGIN
  UPDATE public.studio_channel_consent
     SET status='opted_out', opt_out_at=now(), refusal_unanswered=true
   WHERE organization_id='64000000-0000-4000-8000-000000000010'
     AND channel_kind='sms' AND channel_value='+15556440005';
END $$;
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b5',pg_temp.evidence(),'resend_refused_opted_out');
DO $$ BEGIN
  DELETE FROM public.studio_channel_consent
   WHERE organization_id='64000000-0000-4000-8000-000000000010'
     AND channel_kind='sms' AND channel_value='+15556440008';
END $$;
SELECT pg_temp.refuses('64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-0000000000b8',pg_temp.evidence(),'resend_no_invite_on_file');

-- ═══════════════════════════════════════════════════════════════════════════
-- G · Privilege level (contract S12) and the write-once resend stamp
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_failed boolean := false; v_challenge uuid;
BEGIN
  -- The designer-facing RPC, and nothing else, reaches authenticated.
  ASSERT has_function_privilege('authenticated','public.resend_party_invite(uuid,jsonb)','execute'),
    'G: a studio member may call the resend';
  ASSERT NOT has_function_privilege('anon','public.resend_party_invite(uuid,jsonb)','execute'),
    'G: anon may not';
  ASSERT NOT has_function_privilege('authenticated','public.sms_void_stale_optin_challenges()','execute'),
    'G: the void trigger is not a door';
  ASSERT NOT has_function_privilege('anon','public.sms_void_stale_optin_challenges()','execute'),
    'G: nor for anon';
  ASSERT NOT has_function_privilege('authenticated','public.sms_prompts_guard_binding()','execute'),
    'G: nor is the guard';

  -- The new columns ride sms_prompts' own grants: team-scoped SELECT, no write.
  ASSERT has_table_privilege('authenticated','public.sms_prompts','select'),
    'G: the room can read the challenge it prints';
  ASSERT NOT has_table_privilege('authenticated','public.sms_prompts','update'),
    'G: and cannot stamp a resend by hand';
  ASSERT NOT has_table_privilege('authenticated','public.sms_prompts','insert'),
    'G: nor mint a challenge by hand';
  ASSERT NOT has_table_privilege('anon','public.sms_prompts','select'),
    'G: anon reads no challenge at all';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.sms_prompts'::regclass),
    'G: RLS still stands on sms_prompts';

  -- One resend per version is enforced in the database, not in the caller.
  SELECT id INTO v_challenge FROM public.sms_prompts
   WHERE party_id='64000000-0000-4000-8000-0000000000b1' AND resent_at IS NOT NULL;
  BEGIN
    UPDATE public.sms_prompts SET resent_at=now()+interval '1 hour' WHERE id=v_challenge;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'G: the resend stamp is write-once';

  v_failed := false;
  BEGIN
    UPDATE public.sms_prompts SET resend_evidence='{"source":"forged"}'::jsonb WHERE id=v_challenge;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'G: and so is the evidence it was re-asked on';

  v_failed := false;
  BEGIN
    UPDATE public.sms_prompts SET invite_evidence='{"source":"forged"}'::jsonb WHERE id=v_challenge;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'G: so is the evidence the challenge was asked on';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H · The frozen columns stayed frozen (00594:854, contract US-2 P1)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.project_parties
           WHERE project_id IN ('64000000-0000-4000-8000-000000000020',
                                '64000000-0000-4000-8000-000000000021')
             AND (sms_consent_status IS DISTINCT FROM 'not_asked'
                  OR sms_consented_at IS NOT NULL
                  OR sms_consent_source IS NOT NULL
                  OR sms_consent_evidence IS NOT NULL
                  OR sms_consent_recorded_at IS NOT NULL
                  OR sms_consent_recorded_by IS NOT NULL
                  OR sms_consent_disclosure_version IS NOT NULL))=0,
    'H: no consent evidence reached a seat row';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- I · Correct the phone, correct it BACK — the withdrawn challenge is dead
-- ═══════════════════════════════════════════════════════════════════════════
-- 00646 (SQ-92 F2, probe2b-void-revert.log). A designer fat-fingers the seat's
-- number and undoes it a second later. 00644's trigger withdrew the open
-- challenge on the first edit, correctly, and voided_at is write-once, so the
-- second edit does NOT bring the question back — but the recipient's handset
-- still holds the original text with the original `Ref NN` printed in it, and
-- the seat's number is once again the one that challenge was sent to.
--
-- Before 00646, `YES 18` from that handset resolved the withdrawn row and
-- GRANTED consent on the record: a studio's withdrawn question answered
-- itself. Both doors now refuse it — the resolver returns nothing, and the
-- grant function, which is callable in its own right, answers `closed`.
DO $$
DECLARE
  v_challenge uuid; v_message uuid; v_result jsonb; v_record jsonb;
BEGIN
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000c0','+15556440010',
    interval '30 hours','18');

  UPDATE public.project_parties SET phone='+15556449010'
   WHERE id='64000000-0000-4000-8000-0000000000c0';
  ASSERT (SELECT voided_at IS NOT NULL AND void_reason='phone_corrected'
            FROM public.sms_prompts WHERE id=v_challenge),
    'I: the correction withdrew the open challenge';

  UPDATE public.project_parties SET phone='+15556440010'
   WHERE id='64000000-0000-4000-8000-0000000000c0';
  ASSERT (SELECT voided_at IS NOT NULL AND answered_at IS NULL
            FROM public.sms_prompts WHERE id=v_challenge),
    'I: reverting the number does not un-ask the withdrawn question';
  ASSERT (SELECT normalize_channel_value('sms',phone)='+15556440010'
            FROM public.project_parties WHERE id='64000000-0000-4000-8000-0000000000c0'),
    'I: …and the seat is back on the number that challenge was sent to';

  -- The inbound rail's own door: `Ref 18` for this handset resolves to nothing.
  ASSERT (SELECT count(*) FROM public.sms_resolve_prompt(
            '+15556449999','+15556440010','18'))=0,
    'I: a withdrawn challenge is not resolvable by its printed code';
  -- …and the code is not merely shadowed by a newer row: it is the only one.
  ASSERT (SELECT count(*) FROM public.sms_prompts
           WHERE party_id='64000000-0000-4000-8000-0000000000c0')=1,
    'I: there is exactly one challenge, and it is the withdrawn one';

  -- The grant door, called directly the way sms-inbound calls it.
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]') INTO v_record
    FROM public.studio_channel_consent t;
  v_message := gen_random_uuid();
  INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid)
  VALUES (v_message,'64000000-0000-4000-8000-0000000000e0','inbound','YES 18',
          'SM'||replace(v_message::text,'-',''));
  v_result := public.sms_grant_optin_prompt(v_challenge,'+15556449999','+15556440010',v_message);
  ASSERT v_result->>'status'='closed',
    'I: a withdrawn challenge cannot grant, got '||COALESCE(v_result::text,'<null>');
  ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]')=v_record
            FROM public.studio_channel_consent t),
    'I: and the consent record is byte-for-byte what it was';
  ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL AND consumption_result IS NULL
            FROM public.sms_prompts WHERE id=v_challenge),
    'I: the withdrawn row takes no receipt either';

  -- NEGATIVE CONTROL, in the same transaction: the identical reply on an
  -- identical challenge that was never withdrawn DOES grant. So what refused
  -- above is voided_at and not the endpoint check, the code, or the record.
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000c1','+15556440011',
    interval '30 hours','19');
  v_message := gen_random_uuid();
  INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid)
  VALUES (v_message,'64000000-0000-4000-8000-0000000000e1','inbound','YES 19',
          'SM'||replace(v_message::text,'-',''));
  ASSERT (SELECT count(*) FROM public.sms_resolve_prompt(
            '+15556449999','+15556440011','19'))=1,
    'I: an open challenge still resolves by its code';
  v_result := public.sms_grant_optin_prompt(v_challenge,'+15556449999','+15556440011',v_message);
  ASSERT v_result->>'status'='granted',
    'I: the same reply on an OPEN challenge grants, got '||COALESCE(v_result::text,'<null>');
  ASSERT (SELECT status='granted' FROM public.studio_channel_consent
           WHERE organization_id='64000000-0000-4000-8000-000000000010'
             AND channel_kind='sms' AND channel_value='+15556440011'),
    'I: on the record, which is the only grant';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- J · resend_evidence holds evidence, not whatever the caller sent
-- ═══════════════════════════════════════════════════════════════════════════
-- 00646 (SQ-92 F3). 00644 merged p_evidence wholesale, so a client could park
-- arbitrary JSON on a consent-evidence row that no designer can edit and no
-- audit expects. Two halves: the RPC STRIPS (a caller sending an extra still
-- gets its resend — refusing would be punishing the wrong person), and the
-- column's CHECK binds every other writer, service role included.
DO $$
DECLARE v_challenge uuid; v_result jsonb; v_keys text[]; v_failed boolean;
BEGIN
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000c2','+15556440012',
    interval '30 hours','21');

  PERFORM pg_temp.assume_user_role('64000000-0000-4000-8000-000000000001');
  v_result := public.resend_party_invite('64000000-0000-4000-8000-0000000000c2',
    pg_temp.evidence() || jsonb_build_object(
      'recorded_by','64000000-0000-4000-8000-000000000002',  -- forged: overwritten
      'recorded_at','1999-01-01T00:00:00Z',                  -- forged: overwritten
      'internal_note','free text nobody asked for',
      'tracking',jsonb_build_object('campaign','q4'),
      'admin',true));
  PERFORM pg_temp.reset_role();
  ASSERT v_result->>'status'='queued', 'J: an extra key does not cost the designer the resend';

  SELECT array_agg(k ORDER BY k) INTO v_keys
    FROM public.sms_prompts p, jsonb_object_keys(p.resend_evidence) k
   WHERE p.id=v_challenge;
  ASSERT v_keys = ARRAY['disclosure_version','note','recorded_at','recorded_by','source'],
    'J: the stored object holds ONLY the allowed keys, got '||COALESCE(v_keys::text,'<null>');
  ASSERT (SELECT (resend_evidence->>'recorded_by')::uuid='64000000-0000-4000-8000-000000000001'
            AND (resend_evidence->>'recorded_at')::timestamptz > now()-interval '1 minute'
            AND resend_evidence->>'source'='verbal'
            AND resend_evidence->>'note'='They said yes on the phone'
            FROM public.sms_prompts WHERE id=v_challenge),
    'J: the recorder and the moment are the server''s, not the caller''s';

  -- The CHECK, for every writer that is not the RPC. The resend stamp on this
  -- row is already spent, so a fresh challenge carries the direct write.
  v_challenge := pg_temp.challenge('64000000-0000-4000-8000-0000000000c1','+15556440011',
    interval '30 hours','22');
  v_failed := false;
  BEGIN
    UPDATE public.sms_prompts
       SET resent_at=now(), resent_by='64000000-0000-4000-8000-000000000001',
           resend_evidence=jsonb_build_object('source','verbal','disclosure_version','v1',
             'note','n','recorded_by','64000000-0000-4000-8000-000000000001',
             'recorded_at',now(),'admin',true)
     WHERE id=v_challenge;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'J: an unknown key on resend_evidence is refused by the column';

  -- The same shape WITHOUT the stray key is accepted, so the constraint is
  -- the key list and not the write.
  UPDATE public.sms_prompts
     SET resent_at=now(), resent_by='64000000-0000-4000-8000-000000000001',
         resend_evidence=jsonb_build_object('source','verbal','disclosure_version','v1',
           'note','n','recorded_by','64000000-0000-4000-8000-000000000001',
           'recorded_at',now())
   WHERE id=v_challenge;
  ASSERT (SELECT resend_evidence ? 'source' FROM public.sms_prompts WHERE id=v_challenge),
    'J: …and the allowed five are still writable';

  -- invite_evidence carries the same shape, so it carries the same rule.
  v_failed := false;
  BEGIN
    INSERT INTO public.sms_prompts
      (project_id,party_id,sender_number,recipient_phone,kind,subject_id,version,
       short_code,expires_at,invite_evidence)
    VALUES ('64000000-0000-4000-8000-000000000020','64000000-0000-4000-8000-0000000000c1',
      '+15556449999','+15556440011','optin',NULL,99,'23',now()+interval '7 days',
      jsonb_build_object('source','verbal','admin',true));
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'J: and so does the evidence the FIRST ask stood on';

  -- A non-object is not evidence either: the CASE in the CHECK answers false
  -- rather than raising a type error inside the constraint.
  v_failed := false;
  BEGIN
    INSERT INTO public.sms_prompts
      (project_id,party_id,sender_number,recipient_phone,kind,subject_id,version,
       short_code,expires_at,invite_evidence)
    VALUES ('64000000-0000-4000-8000-000000000020','64000000-0000-4000-8000-0000000000c1',
      '+15556449999','+15556440011','optin',NULL,98,'24',now()+interval '7 days',
      '"verbal"'::jsonb);
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  ASSERT v_failed, 'J: a JSON scalar is refused, not raised on';
END $$;

ROLLBACK;
