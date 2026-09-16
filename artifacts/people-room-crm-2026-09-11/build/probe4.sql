BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a4000000-0000-4000-8000-000000000001','p4-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('a4000000-0000-4000-8000-000000000001','p4-a@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
 ('b4000000-0000-4000-8000-00000000000a','design_studio','P4 Alpha','p4-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
 ('a4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('d4000000-0000-4000-8000-00000000000a','P4 job','a4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-000000000001','active',NOW(),NOW());
-- A dated inbound STOP, the fully-evidenced shape.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES ('e4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-00000000000a','sub','Pete','612-555-0188','opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1');
SELECT public.backfill_channel_consent_from_parties();
DO $$
DECLARE r record; nOpted int; rec record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a4000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO r FROM public.record_channel_reconsent(
    'b4000000-0000-4000-8000-00000000000a','sms','+16125550188',
    'written','Signed a fresh field-sms form 2026-09-11','field-sms-v2',
    'd4000000-0000-4000-8000-00000000000a');
  RAISE NOTICE 'PROBE4: after reconsent record.status=% refusal_unanswered=% opt_out_at=%', r.status, r.refusal_unanswered, r.opt_out_at;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO nOpted FROM project_parties
   WHERE phone_e164='+16125550188' AND sms_consent_status='opted_out';
  RAISE NOTICE 'PROBE4: party rows on the number still reading opted_out = % (the send gate''s backstop)', nOpted;
  SELECT sms_consent_status, sms_opt_out_at INTO rec FROM project_parties WHERE id='e4000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PROBE4: the STOP seat now reads status=% opt_out_at=%', rec.sms_consent_status, rec.sms_opt_out_at;
  RAISE NOTICE 'PROBE4: channelConsentVerdict() selects only "status" -> it reads % here, never refusal_unanswered', r.status;
END $$;
ROLLBACK;
