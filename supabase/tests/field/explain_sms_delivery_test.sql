-- Standalone, synthetic, rolled back; run only in the disposable controller DB.
-- 00647 (P1-03): explain_sms_delivery is a DIAGNOSTIC, not a door.
--
-- What is proved here: the whole picture for a member of the studio the seat's
-- project records consent in; the SAME EMPTY RESULT for every unauthorized
-- shape (foreign studio, removed seat, project attached to no studio, unknown
-- party, NULL party) with no exception and therefore no DETAIL to read; the
-- consent word coming off studio_channel_consent even when the frozen
-- project_parties.sms_consent_* columns are forced to say something else; the
-- field link's expiry present while neither its token nor its hash appears
-- anywhere in the row; `delivered` never dressed up as `read`; and the privilege
-- level of what this migration adds. Nothing is written by the function under
-- test, and nothing here reaches a provider.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email) VALUES
 ('67000000-0000-4000-8000-000000000001','sq13-a@test.invalid'),
 ('67000000-0000-4000-8000-000000000002','sq13-b@test.invalid'),
 ('67000000-0000-4000-8000-000000000003','sq13-c@test.invalid'),
 ('67000000-0000-4000-8000-000000000004','sq13-d@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES
 ('67000000-0000-4000-8000-000000000001','sq13-a@test.invalid','SQ13 designer A'),
 ('67000000-0000-4000-8000-000000000002','sq13-b@test.invalid','SQ13 designer B'),
 ('67000000-0000-4000-8000-000000000003','sq13-c@test.invalid','SQ13 former seat'),
 ('67000000-0000-4000-8000-000000000004','sq13-d@test.invalid','SQ13 unattached')
 ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('67000000-0000-4000-8000-000000000010','design_studio','SQ13 studio','sq13-studio','active'),
 ('67000000-0000-4000-8000-000000000011','design_studio','SQ13 other studio','sq13-other','active');
-- The third member LEFT: an inactive seat is not a member, and the diagnostic
-- must tell them exactly as much as it tells a stranger.
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('67000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000010','owner','active'),
 ('67000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000011','owner','active'),
 ('67000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000010','admin','removed');

INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('67000000-0000-4000-8000-000000000020','SQ13 project',
  '67000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000010'),
 ('67000000-0000-4000-8000-000000000021','SQ13 other project',
  '67000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000002',
  '67000000-0000-4000-8000-000000000011'),
 -- Designer 4 belongs to no studio, so project_consent_org() resolves NULL for
 -- this project: there is no ledger to be a member of, and nobody may read it.
 ('67000000-0000-4000-8000-000000000022','SQ13 unattached project',
  '67000000-0000-4000-8000-000000000004','67000000-0000-4000-8000-000000000004',
  NULL);

-- One seat per question:
--   a1 the whole picture   a2 stored for the morning   a3 the handset said stop
--   a6 the frozen legacy columns lying   af another studio's seat
--   ac a seat on a project no studio owns
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('67000000-0000-4000-8000-0000000000a1','67000000-0000-4000-8000-000000000020','sub','SQ13 Drywaller','+15556470001'),
 ('67000000-0000-4000-8000-0000000000a2','67000000-0000-4000-8000-000000000020','sub','SQ13 Painter','+15556470002'),
 ('67000000-0000-4000-8000-0000000000a3','67000000-0000-4000-8000-000000000020','sub','SQ13 Tiler','+15556470003'),
 ('67000000-0000-4000-8000-0000000000a6','67000000-0000-4000-8000-000000000020','sub','SQ13 Glazier','+15556470006'),
 ('67000000-0000-4000-8000-0000000000af','67000000-0000-4000-8000-000000000021','sub','SQ13 Foreign','+15556470007'),
 ('67000000-0000-4000-8000-0000000000ac','67000000-0000-4000-8000-000000000022','sub','SQ13 Unattached','+15556470008');

-- The record is the only grant (00594/00622).
INSERT INTO studio_channel_consent
 (organization_id,channel_kind,channel_value,status,source,evidence,disclosure_version,recorded_by,recorded_at)
VALUES
 ('67000000-0000-4000-8000-000000000010','sms','+15556470001','pending','verbal','Said yes on the phone','field-sms-v1','67000000-0000-4000-8000-000000000001',now()-interval '40 hours'),
 ('67000000-0000-4000-8000-000000000010','sms','+15556470002','granted','web_form','Signed the kickoff form','field-sms-v1','67000000-0000-4000-8000-000000000001',now()-interval '8 days'),
 ('67000000-0000-4000-8000-000000000010','sms','+15556470003','granted','verbal','Said yes on the phone','field-sms-v1','67000000-0000-4000-8000-000000000001',now()-interval '9 days'),
 -- The RECORD says they refused. The seat columns below will be forced to say
 -- the opposite, and the diagnostic must side with the record.
 ('67000000-0000-4000-8000-000000000010','sms','+15556470006','opted_out','verbal','Told us to stop on site','field-sms-v1','67000000-0000-4000-8000-000000000001',now()-interval '20 days'),
 ('67000000-0000-4000-8000-000000000011','sms','+15556470007','pending','verbal','Said yes on the phone','field-sms-v1','67000000-0000-4000-8000-000000000002',now()-interval '40 hours');
UPDATE studio_channel_consent SET refusal_unanswered=true, opt_out_at=now()-interval '20 days'
 WHERE organization_id='67000000-0000-4000-8000-000000000010'
   AND channel_kind='sms' AND channel_value='+15556470006';

INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('67000000-0000-4000-8000-000000000050','+15556479999','+15556470001'),
 ('67000000-0000-4000-8000-000000000051','+15556479999','+15556470002'),
 ('67000000-0000-4000-8000-000000000052','+15556479999','+15556470003');

-- a1: one text landed, the next one bounced off a phone that was switched off.
INSERT INTO sms_messages(id,conversation_id,direction,body,party_id,project_id,
                         template_key,twilio_status,error_code,error_message,created_at)
VALUES
 ('67000000-0000-4000-8000-000000000060','67000000-0000-4000-8000-000000000050','outbound',
  'Middle West Studio: first one',
  '67000000-0000-4000-8000-0000000000a1','67000000-0000-4000-8000-000000000020',
  'sms_optin_invite','delivered',NULL,NULL,now()-interval '40 hours'),
 ('67000000-0000-4000-8000-000000000061','67000000-0000-4000-8000-000000000050','outbound',
  'Middle West Studio: site card',
  '67000000-0000-4000-8000-0000000000a1','67000000-0000-4000-8000-000000000020',
  'sms_site_card','undelivered','30003','Unreachable destination handset',now()-interval '2 hours'),
-- a2: stored for the morning rather than sent into the night.
 ('67000000-0000-4000-8000-000000000062','67000000-0000-4000-8000-000000000051','outbound',
  'Middle West Studio: tomorrow',
  '67000000-0000-4000-8000-0000000000a2','67000000-0000-4000-8000-000000000020',
  'sms_day_of','deferred',NULL,'quiet_hours',now()-interval '30 minutes'),
-- a3: the carrier took it, and then the handset said STOP. Delivered is the
-- carrier's word about a handset, never about a person reading anything.
 ('67000000-0000-4000-8000-000000000063','67000000-0000-4000-8000-000000000052','outbound',
  'Middle West Studio: day of',
  '67000000-0000-4000-8000-0000000000a3','67000000-0000-4000-8000-000000000020',
  'sms_day_of','delivered',NULL,NULL,now()-interval '3 hours');

INSERT INTO sms_suppressions(sender_number,recipient_phone,reason)
VALUES ('+15556479999','+15556470003','stop');

-- a1's cadence, as the sender stamped it for its own local day.
INSERT INTO sms_conversation_context
 (conversation_id,project_id,party_id,budget_local_day,budget_recurring_used,budget_events_used)
VALUES ('67000000-0000-4000-8000-000000000050','67000000-0000-4000-8000-000000000020',
        '67000000-0000-4000-8000-0000000000a1',current_date,1,2);

-- a1's challenge: asked 40h ago, re-asked 30h ago (so the floor's clock is the
-- resend), plus one open site-card question with its own ref code.
INSERT INTO sms_prompts
 (id,project_id,party_id,sender_number,recipient_phone,kind,version,short_code,
  expires_at,created_at,invite_evidence,resent_at,resent_by,resend_evidence)
VALUES
 ('67000000-0000-4000-8000-000000000070','67000000-0000-4000-8000-000000000020',
  '67000000-0000-4000-8000-0000000000a1','+15556479999','+15556470001','optin',1,'71',
  now()+interval '5 days',now()-interval '40 hours',
  jsonb_build_object('source','verbal','disclosure_version','field-sms-v1','note','Said yes on the phone',
                     'recorded_by','67000000-0000-4000-8000-000000000001','recorded_at',now()-interval '40 hours'),
  now()-interval '30 hours','67000000-0000-4000-8000-000000000001',
  jsonb_build_object('source','verbal','disclosure_version','field-sms-v1','note','Asked again on site',
                     'recorded_by','67000000-0000-4000-8000-000000000001','recorded_at',now()-interval '30 hours')),
 ('67000000-0000-4000-8000-000000000071','67000000-0000-4000-8000-000000000020',
  '67000000-0000-4000-8000-0000000000a1','+15556479999','+15556470001','site_card',1,'72',
  now()+interval '2 days',now()-interval '3 hours',NULL,NULL,NULL,NULL),
 -- Answered, so it is not open; it must not appear beside the two that are.
 ('67000000-0000-4000-8000-000000000072','67000000-0000-4000-8000-000000000020',
  '67000000-0000-4000-8000-0000000000a1','+15556479999','+15556470001','day_of',1,'73',
  now()+interval '2 days',now()-interval '20 hours',NULL,NULL,NULL,NULL);
UPDATE sms_prompts SET answered_at=now()-interval '19 hours'
 WHERE id='67000000-0000-4000-8000-000000000072';

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.assume_user_role(p_user_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user_role(UUID) TO PUBLIC;

CREATE FUNCTION pg_temp.reset_role() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',NULL,true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- THE ONE SHAPE OF A REFUSAL. Not an error with a readable DETAIL, not a row
-- of NULLs that confirms a seat exists — nothing at all, identically, for every
-- caller who is not an active member of the studio the seat answers to.
CREATE FUNCTION pg_temp.explains_nothing(
  p_user uuid, p_party uuid, p_label text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_count integer := -1; v_failed boolean := false; v_message text;
BEGIN
  PERFORM pg_temp.assume_user_role(p_user);
  BEGIN
    SELECT count(*) INTO v_count FROM public.explain_sms_delivery(p_party);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true; v_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT NOT v_failed,
    p_label||': no exception to read, got '||COALESCE(v_message,'<none>');
  ASSERT v_count = 0, p_label||': the empty result, got '||v_count||' row(s)';
END $$;

-- The whole answer as one string, for the credential grep below.
CREATE FUNCTION pg_temp.explanation_text(p_user uuid, p_party uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_text text;
BEGIN
  PERFORM pg_temp.assume_user_role(p_user);
  SELECT COALESCE(jsonb_agg(to_jsonb(e))::text,'[]')
    INTO v_text FROM public.explain_sms_delivery(p_party) e;
  PERFORM pg_temp.reset_role();
  RETURN v_text;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A · The whole picture, for the studio that owns the seat
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_row record; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a1');
  SELECT * INTO v_row
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 1, 'A: one seat, one explanation, got '||v_rows;
  ASSERT v_row.party_id = '67000000-0000-4000-8000-0000000000a1'::uuid, 'A: the seat asked about';
  ASSERT v_row.project_id = '67000000-0000-4000-8000-000000000020'::uuid, 'A: on its own project';

  -- The consent word and where it came from — the RECORD, and only the record.
  ASSERT v_row.consent_state = 'pending', 'A: the record says pending, got '||COALESCE(v_row.consent_state,'<null>');
  ASSERT v_row.consent_source = 'verbal', 'A: with the record''s own source, got '||COALESCE(v_row.consent_source,'<null>');
  ASSERT v_row.consent_recorded_at IS NOT NULL, 'A: and when it was recorded';
  ASSERT NOT v_row.suppressed, 'A: this handset has not asked us to stop';
  ASSERT v_row.suppression_reason IS NULL, 'A: so there is no stop to explain';

  -- The last attempt, in our word and in the provider's.
  ASSERT v_row.last_attempt_status = 'failed',
    'A: the last one did not arrive, got '||COALESCE(v_row.last_attempt_status,'<null>');
  ASSERT v_row.provider_status = 'undelivered',
    'A: the provider''s own word is kept, got '||COALESCE(v_row.provider_status,'<null>');
  ASSERT v_row.carrier_code = '30003',
    'A: with the code the room has words for, got '||COALESCE(v_row.carrier_code,'<null>');
  ASSERT v_row.last_attempt_at > now()-interval '3 hours'
     AND v_row.last_attempt_at < now(),
    'A: the LAST attempt, not the first';
  ASSERT v_row.deferred_due_at IS NULL, 'A: nothing of theirs is waiting for morning';

  -- The live link's END, and nothing else about it (case E greps for the rest).
  ASSERT v_row.link_expires_at IS NULL, 'A: no link minted for this seat yet';

  -- The resend, and the moment 00644 would allow the next one.
  ASSERT v_row.resent_at IS NOT NULL, 'A: this question has been asked again once';
  ASSERT v_row.next_resend_allowed_at
         BETWEEN v_row.resent_at + interval '23 hours 59 minutes'
             AND v_row.resent_at + interval '24 hours 1 minute',
    'A: the next one is a day after the resend — 00644''s own floor';
  ASSERT v_row.void_reason IS NULL, 'A: the question was never withdrawn';

  -- The day's allowance, as the sender stamped it.
  ASSERT v_row.budget_local_day = current_date, 'A: today''s counters';
  ASSERT v_row.budget_recurring_used = 1, 'A: one digest spent';
  ASSERT v_row.budget_events_used = 2, 'A: two event texts spent';

  -- Every question still waiting, and only those.
  ASSERT jsonb_array_length(v_row.open_prompts) = 2,
    'A: two open questions, got '||jsonb_array_length(v_row.open_prompts);
  ASSERT v_row.open_prompts @> '[{"ref":"71","kind":"optin"}]'::jsonb,
    'A: the opt-in ref is one of them';
  ASSERT v_row.open_prompts @> '[{"ref":"72","kind":"site_card"}]'::jsonb,
    'A: and so is the site card';
  ASSERT NOT (v_row.open_prompts::text LIKE '%"73"%'),
    'A: the answered one is not open';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B · Stored for the morning, and the moment it comes due
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_row record;
BEGIN
  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  SELECT * INTO v_row
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a2');
  PERFORM pg_temp.reset_role();

  ASSERT v_row.provider_status = 'deferred', 'B: the row is still waiting';
  ASSERT v_row.last_attempt_status = 'waiting',
    'B: and the word for it is plain, got '||COALESCE(v_row.last_attempt_status,'<null>');
  ASSERT v_row.deferred_due_at IS NOT NULL, 'B: it comes due at a knowable moment';
  ASSERT v_row.deferred_due_at >= now()-interval '1 second',
    'B: which is now or later, never in the past';
  ASSERT v_row.deferred_due_at < now()+interval '24 hours',
    'B: and inside a day — the next 08:00 at the latest';
  ASSERT v_row.consent_state = 'granted', 'B: they said yes on a form';
  ASSERT v_row.consent_source = 'web_form', 'B: and the record says which';
  ASSERT v_row.budget_local_day IS NULL, 'B: no cadence counters for this seat yet';
  ASSERT v_row.open_prompts = '[]'::jsonb, 'B: and no question waiting on them';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- C · A closed handset, and `delivered` is never `read`
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_row record;
BEGIN
  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  SELECT * INTO v_row
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a3');
  PERFORM pg_temp.reset_role();

  ASSERT v_row.suppressed, 'C: this handset asked us to stop';
  ASSERT v_row.suppression_reason = 'stop',
    'C: and why, got '||COALESCE(v_row.suppression_reason,'<null>');
  -- Suppression outranks the studio's own record, exactly as the send gate
  -- orders its gates: a `granted` record on a stopped handset reads opted_out.
  ASSERT v_row.consent_state = 'opted_out',
    'C: the stop outranks a granted record, got '||COALESCE(v_row.consent_state,'<null>');
  ASSERT v_row.provider_status = 'delivered', 'C: the carrier did take that one';
  ASSERT v_row.last_attempt_status = 'delivered',
    'C: and our word for it is delivered, got '||COALESCE(v_row.last_attempt_status,'<null>');
  ASSERT v_row.last_attempt_status <> 'read',
    'C: a carrier receipt is never evidence anybody read anything';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D · The frozen seat columns cannot speak for the record
-- ═══════════════════════════════════════════════════════════════════════════
-- 00594:854 froze project_parties.sms_consent_*, and 00594's own repair door
-- (app.consent_legacy_write) is the only way to move them. Forced to say
-- `granted`, they must change nothing: the record says the person refused.
DO $$
DECLARE v_row record;
BEGIN
  SET LOCAL app.consent_legacy_write = 'on';
  UPDATE public.project_parties
     SET sms_consent_status='granted',
         sms_consented_at=now(),
         sms_consent_source='verbal',
         sms_consent_evidence='a legacy column nobody may believe'
   WHERE id='67000000-0000-4000-8000-0000000000a6';
  SET LOCAL app.consent_legacy_write = 'off';

  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  SELECT * INTO v_row
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a6');
  PERFORM pg_temp.reset_role();

  ASSERT v_row.consent_state = 'opted_out',
    'D: the record decides, got '||COALESCE(v_row.consent_state,'<null>');
  ASSERT v_row.consent_source = 'verbal', 'D: with the record''s own source';
  ASSERT NOT v_row.suppressed, 'D: a refusal on the record is not a carrier stop';
  ASSERT v_row.last_attempt_at IS NULL, 'D: nothing was ever sent to this seat';
  ASSERT v_row.last_attempt_status IS NULL, 'D: so there is no attempt to describe';
END $$;

-- The legacy columns really were forced, so case D proved a read and not an
-- absence of data.
DO $$ BEGIN
  ASSERT (SELECT sms_consent_status='granted' FROM public.project_parties
           WHERE id='67000000-0000-4000-8000-0000000000a6'),
    'D: the decoy is in place';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E · The link's END is a fact; the link itself is a credential
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_token text := repeat('a1',32);
  v_hash  text;
  v_row   record;
  v_text  text;
BEGIN
  v_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  INSERT INTO public.field_link_tokens(party_id,project_id,token_hash,status,expires_at)
  VALUES ('67000000-0000-4000-8000-0000000000a1','67000000-0000-4000-8000-000000000020',
          v_hash,'active',now()+interval '30 days');
  -- A revoked link is not a live one; its end must not be printed as if it were.
  INSERT INTO public.field_link_tokens(party_id,project_id,token_hash,status,expires_at)
  VALUES ('67000000-0000-4000-8000-0000000000a1','67000000-0000-4000-8000-000000000020',
          encode(extensions.digest(repeat('b2',32),'sha256'),'hex'),'revoked',
          now()+interval '900 days');

  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  SELECT * INTO v_row
    FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.reset_role();

  ASSERT v_row.link_expires_at BETWEEN now()+interval '29 days' AND now()+interval '31 days',
    'E: the live link''s end is the one reported';

  -- THE GREP. The whole returned row as text, searched for the fixture's raw
  -- token and for the hash the table stores. Neither may appear, ever.
  v_text := pg_temp.explanation_text('67000000-0000-4000-8000-000000000001',
                                     '67000000-0000-4000-8000-0000000000a1');
  ASSERT position(v_token in v_text) = 0, 'E: no raw token anywhere in the row';
  ASSERT position(v_hash  in v_text) = 0, 'E: and not its hash either';
  ASSERT position('"71"' in v_text) > 0, 'E: the grep really was over the answer';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- F · Every unauthorized shape is the SAME empty result
-- ═══════════════════════════════════════════════════════════════════════════
-- Another studio's seat, a seat that does not exist, no seat at all, a project
-- attached to no studio, and a member who has left. Five different facts, one
-- answer, so this function cannot be walked as an oracle over another roster.
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-0000000000af','F1 foreign studio');
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-0000000000ff','F2 unknown party');
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000001',
  NULL,'F3 no party at all');
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-0000000000ac','F4 project with no studio');
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000004',
  '67000000-0000-4000-8000-0000000000ac','F5 its own designer, still no ledger');
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000003',
  '67000000-0000-4000-8000-0000000000a1','F6 a seat that was removed');
-- And the other studio's own member reaches nothing of ours.
SELECT pg_temp.explains_nothing('67000000-0000-4000-8000-000000000002',
  '67000000-0000-4000-8000-0000000000a1','F7 the other studio''s member');

-- ═══════════════════════════════════════════════════════════════════════════
-- G · Privilege level (contract S12), and that this reads only
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  ASSERT has_function_privilege('authenticated','public.explain_sms_delivery(uuid)','execute'),
    'G: a studio member may ask why';
  ASSERT has_function_privilege('service_role','public.explain_sms_delivery(uuid)','execute'),
    'G: and so may the rail itself';
  ASSERT NOT has_function_privilege('anon','public.explain_sms_delivery(uuid)','execute'),
    'G: anon may not';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid='public.explain_sms_delivery(uuid)'::regprocedure),
    'G: it is SECURITY DEFINER';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS c
                  WHERE p.oid='public.explain_sms_delivery(uuid)'::regprocedure
                    AND c LIKE 'search_path=%'),
    'G: with its search_path pinned';

  -- A diagnostic writes nothing. Nine calls across five seats, and the two
  -- tables a careless reader might have stamped are byte-identical after.
  SELECT jsonb_build_object(
           'prompts',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.sms_prompts t),
           'consent',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]') FROM public.studio_channel_consent t))
    INTO v_before;
  PERFORM pg_temp.assume_user_role('67000000-0000-4000-8000-000000000001');
  PERFORM count(*) FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a1');
  PERFORM count(*) FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a2');
  PERFORM count(*) FROM public.explain_sms_delivery('67000000-0000-4000-8000-0000000000a3');
  PERFORM pg_temp.reset_role();
  SELECT jsonb_build_object(
           'prompts',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.sms_prompts t),
           'consent',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel_value),'[]') FROM public.studio_channel_consent t))
    INTO v_after;
  ASSERT v_before = v_after, 'G: asking why changes nothing';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H · The frozen columns stayed frozen everywhere else (00594:854)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.project_parties
           WHERE project_id IN ('67000000-0000-4000-8000-000000000020',
                                '67000000-0000-4000-8000-000000000021',
                                '67000000-0000-4000-8000-000000000022')
             AND id <> '67000000-0000-4000-8000-0000000000a6'
             AND (sms_consent_status IS DISTINCT FROM 'not_asked'
                  OR sms_consented_at IS NOT NULL
                  OR sms_consent_source IS NOT NULL
                  OR sms_consent_evidence IS NOT NULL))=0,
    'H: only case D''s deliberate decoy ever touched a seat column';
END $$;

ROLLBACK;
