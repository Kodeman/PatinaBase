\pset pager off
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('d1000000-0000-4000-8000-000000000001','r3b@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001','r3b@test.invalid','Bee',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000b','design_studio','R3b Beta','r3b-beta','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000b','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d3000000-0000-4000-8000-00000000000b','R3b job','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,
                             sms_opt_out_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at)
VALUES ('d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-00000000000b','sub','Pete Rusk','612-555-0199',
        'opted_out','2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z');

\echo '=== the studio folds / records the refusal, then a designer CORRECTS the number (typo) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','d1000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
SELECT status FROM public.record_channel_consent('d2000000-0000-4000-8000-00000000000b','sms','612-555-0199','opted_out','inbound_sms','Replied STOP',NULL,'d3000000-0000-4000-8000-00000000000b');
RESET ROLE;
-- the phone edit the hook ALLOWS on an opted_out seat (no consent column is named)
UPDATE public.project_parties SET phone='612-555-0200' WHERE id='d4000000-0000-4000-8000-000000000001';

SELECT set_config('request.jwt.claims', json_build_object('sub','d1000000-0000-4000-8000-000000000001','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
\echo '--- what the ROOM prints for the corrected number ---'
SELECT display_name, phone, sms_consent_status AS roster_word FROM v_project_roster WHERE roster_id='d4000000-0000-4000-8000-000000000001';
SELECT display_name, status_raw AS directory_word FROM people_directory WHERE person_id='d4000000-0000-4000-8000-000000000001';
\echo '--- what the WRITE gate says about the corrected number ---'
DO $$
DECLARE r TEXT;
BEGIN
  BEGIN PERFORM public.record_channel_consent('d2000000-0000-4000-8000-00000000000b','sms','612-555-0200','granted','written','fresh signed consent','field-sms-v1',NULL);
        r := '(written)';
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  RAISE NOTICE 'record_channel_consent(granted) on the CORRECTED number -> %', r;
  BEGIN PERFORM public.record_channel_invite('d2000000-0000-4000-8000-00000000000b','sms','612-555-0200','written','fresh signed consent','field-sms-v1',NULL);
        r := '(written)';
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  RAISE NOTICE 'record_channel_invite on the CORRECTED number       -> %', r;
  BEGIN PERFORM public.record_channel_reconsent('d2000000-0000-4000-8000-00000000000b','sms','612-555-0200','written','fresh signed consent','field-sms-v1',NULL);
        r := '(written)';
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  RAISE NOTICE 'record_channel_reconsent on the CORRECTED number    -> %', r;
END $$;
\echo '--- and what the send gate (orgHasOptedOutParty, org-scoped) would find ---'
RESET ROLE;
SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
                WHERE pp.phone_e164='+16125550200' AND pp.sms_consent_status='opted_out'
                  AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))='d2000000-0000-4000-8000-00000000000b')
       AS send_gate_refuses_corrected_number;
SELECT count(*) AS records_for_corrected_number FROM studio_channel_consent WHERE channel_value='+16125550200';
ROLLBACK;
