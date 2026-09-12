BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('a2000000-0000-4000-8000-000000000001','r6b@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('a2000000-0000-4000-8000-000000000001','r6b@test.invalid','A',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES ('b2000000-0000-4000-8000-00000000000a','design_studio','R6B','r6b','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES ('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES ('d2000000-0000-4000-8000-00000000000a','R6B job','a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- W4-M1's own population: a clean 2026 grant, and a legacy seat reading `granted`
-- while carrying an unanswered, DATED 2025-11-16 opt-out.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES
 ('e2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','sub','Pete','(612) 555-0777','granted','2026-02-02T00:00:00Z',NULL,'written','clean 2026 grant','2026-02-02T00:00:00Z','field-sms-v1'),
 ('e2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','sub','Pete','612-555-0777','granted',NULL,'2025-11-16T00:00:00Z','inbound_sms','Replied STOP on the Rusk thread','2025-11-16T00:00:00Z','field-sms-v1');

SELECT public.backfill_channel_consent_from_parties() AS folded;
\echo '--- the folded record: where did the refusal DATE go? ---'
SELECT status, refusal_unanswered, opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at, consented_at
  FROM studio_channel_consent WHERE organization_id='b2000000-0000-4000-8000-00000000000a';
ROLLBACK;
