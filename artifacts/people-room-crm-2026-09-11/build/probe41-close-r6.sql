BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a7000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r6b-dee@test.invalid','x',NOW(),NOW(),NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a7000000-0000-4000-8000-000000000001','r6b-dee@test.invalid','Dee',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at) VALUES
  ('b7000000-0000-4000-8000-000000000011','design_studio','R6b X','r6b-x','active',NOW(),NOW()),
  ('b7000000-0000-4000-8000-000000000022','design_studio','R6b Y','r6b-y','active',NOW(),NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at) VALUES
  ('a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000011','owner','active',NOW()-interval '2 y',NOW(),NOW()),
  ('a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000022','owner','active',NOW()-interval '1 y',NOW(),NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at) VALUES
  ('d7000000-0000-4000-8000-000000000022','R6b job','a7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000011','a7000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
    sms_consent_status, sms_consented_at, sms_consent_source, sms_consent_evidence,
    sms_consent_recorded_at, sms_consent_disclosure_version) VALUES
  ('e7000000-0000-4000-8000-000000000702','d7000000-0000-4000-8000-000000000022','sub','Dana','6125550802',
   'granted','2026-01-02T00:00:00Z','written','Kickoff form','2026-01-02T00:00:00Z','field-sms-v1');
SELECT public.backfill_channel_consent_from_parties();
-- the rail's STOP: recorded on the record ONLY (R-AS)
UPDATE studio_channel_consent
   SET status='opted_out', refusal_unanswered=true, opt_out_at=now(),
       opt_out_source='inbound_sms', opt_out_evidence='Inbound STOP', opt_out_recorded_at=now()
 WHERE organization_id='b7000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550802';

DO $$
DECLARE orgb UUID; orga UUID; wb TEXT; wa TEXT; seat TEXT; seatref BOOLEAN; moved BOOLEAN:=false; raised TEXT;
BEGIN
  orgb := public.project_consent_org('d7000000-0000-4000-8000-000000000022');
  wb   := public.channel_consent_status(orgb,'sms','+16125550802');
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a7000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE projects SET studio_id='b7000000-0000-4000-8000-000000000022' WHERE id='d7000000-0000-4000-8000-000000000022';
    moved := true;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  orga := public.project_consent_org('d7000000-0000-4000-8000-000000000022');
  wa   := public.channel_consent_status(orga,'sms','+16125550802');
  SELECT sms_consent_status INTO seat FROM project_parties WHERE id='e7000000-0000-4000-8000-000000000702';
  SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
                  WHERE pp.phone_e164='+16125550802' AND pp.sms_consent_status='opted_out'
                    AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))=orga) INTO seatref;
  RAISE NOTICE '=== P5: the job re-attributed to the designer''s OTHER studio, after a STOP ===';
  RAISE NOTICE 'P5a moved by the designer herself (PostgREST PATCH) = %  %', moved, COALESCE('('||raised||')','');
  RAISE NOTICE 'P5b project_consent_org   before=%  after=%', orgb, orga;
  RAISE NOTICE 'P5c studio verdict         before=%  after=%', COALESCE(wb,'NULL'), COALESCE(wa,'NULL');
  RAISE NOTICE 'P5d frozen seat says=%   new org has an opted_out seat?=%', seat, seatref;
  RAISE NOTICE 'P5e the refusal now lives under the OLD org alone: %',
    (SELECT status||'/'||refusal_unanswered FROM studio_channel_consent
      WHERE organization_id='b7000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550802');
  RAISE NOTICE 'P5f  => channelConsentVerdict(org=new): no record, no opted_out seat => "unknown";';
  RAISE NOTICE 'P5g  => sendPartySms legacy leg: recipient.consent = % => SENDS', seat;
END $$;
ROLLBACK;
