\pset pager off
BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('f1000000-0000-4000-8000-000000000001','r3c@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('f1000000-0000-4000-8000-000000000001','r3c@test.invalid','Cee',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES ('f2000000-0000-4000-8000-00000000000a','design_studio','R3c','r3c','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('f3000000-0000-4000-8000-00000000000a','R3c job','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000001','active',NOW(),NOW());
-- Seat A: Dana, granted number +16125551111, record granted.
-- Seat B: a typo'd seat for Pete that replied STOP on +16125552222.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,
       sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at)
VALUES ('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-00000000000a','sub','Dana Kowalski','612-555-1111','not_asked',NULL,NULL,NULL,NULL),
       ('f4000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-2222','opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z');
SELECT set_config('request.jwt.claims', json_build_object('sub','f1000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
SELECT status FROM public.record_channel_consent('f2000000-0000-4000-8000-00000000000a','sms','612-555-1111','granted','written','Signed the kickoff form','field-sms-v1','f3000000-0000-4000-8000-00000000000a');
RESET ROLE;
\echo '=== the designer corrects Petes typo: 612-555-2222 -> 612-555-1111 (Danas number) ==='
UPDATE public.project_parties SET phone='612-555-1111' WHERE id='f4000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', json_build_object('sub','f1000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
SELECT display_name, sms_consent_status AS roster_word FROM v_project_roster
 WHERE roster_id IN ('f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002') ORDER BY 1;
RESET ROLE;
SELECT status AS record_status, refusal_unanswered FROM studio_channel_consent WHERE channel_value='+16125551111';
SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
        WHERE pp.phone_e164='+16125551111' AND pp.sms_consent_status='opted_out'
          AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))='f2000000-0000-4000-8000-00000000000a')
       AS send_gate_orgHasOptedOutParty_refuses;
ROLLBACK;
