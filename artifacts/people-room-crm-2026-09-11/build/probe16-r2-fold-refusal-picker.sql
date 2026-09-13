BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a1000000-0000-4000-8000-000000000001','rv-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','rv-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b1000000-0000-4000-8000-00000000000a','design_studio','RV Alpha','rv-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-00000000000a','RV job','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- Seat Y: the REAL inbound STOP, dated, with its own words (older).
-- Seat X: the shipped portal's dateless, sourceless refusal (written later).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,
  sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,
  sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES
 ('e1000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-00000000000a','sub','Pete Rusk','(612) 555-0333',
  'opted_out',NULL,'2025-12-03T00:00:00Z','inbound_sms','Replied STOP on the Lindqvist thread','2025-12-03T00:00:00Z','field-sms-v1'),
 ('e1000000-0000-4000-8000-000000000008','d1000000-0000-4000-8000-00000000000a','sub','Pete Rusk','612-555-0333',
  'opted_out',NULL,NULL,NULL,NULL,NULL,NULL);

SELECT public.backfill_channel_consent_from_parties() AS folded;

\echo '--- the record the fold minted ---'
SELECT status, opt_out_at, refusal_unanswered, opt_out_source, opt_out_evidence, opt_out_recorded_at
  FROM studio_channel_consent
 WHERE organization_id='b1000000-0000-4000-8000-00000000000a' AND channel_value='+16125550333';

\echo '--- seats BEFORE any later write ---'
SELECT id, sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE phone_e164='+16125550333' ORDER BY id;

\echo '--- now a studio member calls record_channel_reconsent (the named door) ---'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT status, opt_out_source, opt_out_evidence
  FROM public.record_channel_reconsent('b1000000-0000-4000-8000-00000000000a','sms','+16125550333','written','Signed a fresh consent form 12 Sep 2026','field-sms-v1',NULL);
RESET ROLE;

\echo '--- seats AFTER the reconsent (the mirror ran) ---'
SELECT id, sms_consent_status, sms_opt_out_at, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE phone_e164='+16125550333' ORDER BY id;
ROLLBACK;
