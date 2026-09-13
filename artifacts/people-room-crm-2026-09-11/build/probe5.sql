BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a5000000-0000-4000-8000-000000000001','p5-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a5000000-0000-4000-8000-000000000001','p5-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b5000000-0000-4000-8000-00000000000a','design_studio','P5 Alpha','p5-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('d5000000-0000-4000-8000-00000000000a','P5 job','a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-000000000001','active',NOW(),NOW());
-- A FULLY DATED inbound STOP on the seat. No consent record exists (pre-fold / new number).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES ('e5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-00000000000a','sub','Pete','612-555-0199','opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1');
DO $$
DECLARE r record; seat record; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a5000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- The seat gate (2a) runs ONLY for p_status='granted'. Take 'pending' instead.
  SELECT * INTO r FROM public.record_channel_consent(
    'b5000000-0000-4000-8000-00000000000a','sms','+16125550199','pending',
    'verbal','He said go ahead on site','field-sms-v1','d5000000-0000-4000-8000-00000000000a');
  RAISE NOTICE 'PROBE5: pending over a DATED seat refusal -> record.status=% refusal_unanswered=% opt_out_at=%', r.status, r.refusal_unanswered, r.opt_out_at;
  EXECUTE 'RESET ROLE';
  SELECT sms_consent_status, sms_opt_out_at INTO seat FROM project_parties WHERE id='e5000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE5: the STOP seat now reads status=% opt_out_at=%', seat.sms_consent_status, seat.sms_opt_out_at;
  SELECT count(*) INTO n FROM project_parties WHERE phone_e164='+16125550199' AND sms_consent_status='opted_out';
  RAISE NOTICE 'PROBE5: seats still reading opted_out on the number = %', n;
  -- and now the granted door, which the seat gate was supposed to hold shut
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a5000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT * INTO r FROM public.record_channel_consent(
      'b5000000-0000-4000-8000-00000000000a','sms','+16125550199','granted',
      'written','Form','field-sms-v1','d5000000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE5: the follow-up GRANTED went through -> status=%', r.status;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE5: the follow-up granted was refused: %', SQLERRM; END;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
