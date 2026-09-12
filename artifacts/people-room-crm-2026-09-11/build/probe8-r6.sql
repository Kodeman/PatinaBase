-- r6 re-run of probe5 (B6-1 / M6-2) and probe3c (M6-5) with the refusals caught,
-- so the whole state prints instead of the transaction aborting on the first raise.
BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a8000000-0000-4000-8000-000000000001','p8-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a8000000-0000-4000-8000-000000000001','p8-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b8000000-0000-4000-8000-00000000000a','design_studio','P8 Alpha','p8-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('d8000000-0000-4000-8000-00000000000a','P8 job','a8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-00000000000a','a8000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,company_name,created_by) VALUES
 ('c8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-00000000000a','person','sub','Ray Thao',NULL,'a8000000-0000-4000-8000-000000000001');
-- A FULLY DATED inbound STOP on the seat. No consent record (pre-fold / new number).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES ('e8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-00000000000a','sub','Pete','612-555-0199','opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1');
DO $$
DECLARE r record; seat record; n int; st text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a8000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- B6-1: the 'pending' first hop.
  BEGIN
    SELECT * INTO r FROM public.record_channel_consent(
      'b8000000-0000-4000-8000-00000000000a','sms','+16125550199','pending',
      'verbal','He said go ahead on site','field-sms-v1','d8000000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE8a: pending over a DATED seat refusal WENT THROUGH -> status=%', r.status;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE8a: pending refused with %', SQLERRM; END;
  -- and the grant behind it.
  BEGIN
    SELECT * INTO r FROM public.record_channel_consent(
      'b8000000-0000-4000-8000-00000000000a','sms','+16125550199','granted',
      'written','Form','field-sms-v1','d8000000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE8b: the follow-up GRANTED went through -> status=%', r.status;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE8b: granted refused with %', SQLERRM; END;
  -- M6-5: an out-of-vocabulary forbidding, on an INSERT that really lands.
  BEGIN
    INSERT INTO studio_contact_rules (subject_type,subject_id,channels_forbidden,reason)
    VALUES ('person','c8000000-0000-4000-8000-000000000001',ARRAY['carrier pigeon','sms'],'never texted');
    RAISE NOTICE 'PROBE8e: an out-of-vocabulary channels_forbidden ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE8e: refused % (%)', SQLERRM, SQLSTATE; END;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type,subject_id,channels_forbidden,reason)
    VALUES ('person','c8000000-0000-4000-8000-000000000001',ARRAY['mobile'],'never texted');
    RAISE NOTICE 'PROBE8f: the real vocabulary ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE8f: refused %', SQLERRM; END;
  EXECUTE 'RESET ROLE';
  SELECT sms_consent_status, sms_opt_out_at INTO seat FROM project_parties WHERE id='e8000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE8c: the STOP seat reads status=% opt_out_at=%', seat.sms_consent_status, seat.sms_opt_out_at;
  SELECT count(*) INTO n FROM studio_channel_consent WHERE channel_value='+16125550199';
  RAISE NOTICE 'PROBE8d: consent records minted on the number = %', n;
  -- M6-2: the only writer left that can reach a seat with a standing refusal is
  -- the inbound rail, writing a verdict that carries no opt_out_at.
  INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status,consented_at,opt_out_at,refusal_unanswered,source,evidence,recorded_at,disclosure_version)
  VALUES ('b8000000-0000-4000-8000-00000000000a','sms','+16125550199','granted','2026-06-01T00:00:00Z',NULL,false,'inbound_sms','Replied START','2026-06-01T00:00:00Z','field-sms-v1');
  SELECT sms_consent_status, sms_opt_out_at, sms_consented_at INTO seat FROM project_parties WHERE id='e8000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE8g: after the inbound START the seat reads status=% opt_out_at=% consented_at=%', seat.sms_consent_status, seat.sms_opt_out_at, seat.sms_consented_at;
END $$;
ROLLBACK;
