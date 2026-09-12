BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a1000000-0000-4000-8000-000000000001','r6-alice@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','r6-alice@test.invalid','Alice',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('b1000000-0000-4000-8000-00000000000a','design_studio','R6 Alpha','r6-alpha','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-00000000000a','R6 job','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- THE SHIPPED PORTAL SHAPE: opted_out, no date, NO SOURCE, NO EVIDENCE
-- (use-coordination.ts revertsToOptedOut writes NOT_ASKED_CONSENT_COLUMNS + opted_out).
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status)
VALUES ('e1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-00000000000a','sub','Pete Rusk','(612) 555-0777','opted_out');

SELECT public.backfill_channel_consent_from_parties() AS folded;

\echo '--- record after the fold ---'
SELECT status, refusal_unanswered, source, evidence, opt_out_source, opt_out_evidence
  FROM studio_channel_consent WHERE organization_id='b1000000-0000-4000-8000-00000000000a';

\echo '--- seat BEFORE reconsent ---'
SELECT sms_consent_status, sms_consent_source, sms_consent_evidence
  FROM project_parties WHERE id='e1000000-0000-4000-8000-000000000001';

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', json_build_object('sub','a1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT status, source, evidence, opt_out_source
  FROM public.record_channel_reconsent(
    'b1000000-0000-4000-8000-00000000000a','sms','+16125550777',
    'written','Signed a fresh consent form 11 Sep 2026','field-sms-v2');
RESET ROLE;

\echo '--- seat AFTER the studio reconsent (R-Q reads THIS) ---'
SELECT sms_consent_status, sms_consent_source, sms_consent_evidence, sms_consent_recorded_at
  FROM project_parties WHERE id='e1000000-0000-4000-8000-000000000001';
ROLLBACK;
