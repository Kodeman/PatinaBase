\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role)
VALUES ('f5000000-0000-4000-8000-000000000001','fold@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('f5000000-0000-4000-8000-000000000001','fold@t.test','F',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,name,slug,type,created_at,updated_at) VALUES ('f6000000-0000-4000-8000-000000000001','Fold Studio','fold-studio','design_studio',now(),now());
INSERT INTO organization_members (organization_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('f6000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','owner','active',now(),now(),now());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES ('f7000000-0000-4000-8000-000000000001','Fold job','f5000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','active',now(),now());
-- a pre-fold seat carrying a real grant, and a parked site request on it
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status,sms_consented_at,sms_consent_source,sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version)
VALUES ('f8000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','sub','Fold Sub','612-555-0921','granted',now()-interval '30 days','written','Signed the form',now()-interval '30 days','field-sms-v1');
INSERT INTO site_requests (id,project_id,created_by,assignee_party_id,status,due_at,note)
VALUES ('f9000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','awaiting_consent',now()+interval '3 days','fold');
DO $$
DECLARE n int; raised text;
BEGIN
  SELECT count(*) INTO n FROM site_request_dispatch_outbox WHERE action='consent-granted';
  RAISE NOTICE 'F1 consent-granted outbox rows BEFORE the fold re-run = %', n;
  raised := NULL;
  BEGIN PERFORM public.backfill_channel_consent_from_parties();
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'F2 fold re-run raised = %', COALESCE(raised,'<none>');
  SELECT count(*) INTO n FROM site_request_dispatch_outbox WHERE action='consent-granted';
  RAISE NOTICE 'F3 consent-granted outbox rows AFTER the fold re-run = % (report says a re-run "sends nothing")', n;
  SELECT count(*) INTO n FROM site_request_events WHERE event_type='consent_granted_dispatch_ready';
  RAISE NOTICE 'F4 consent_granted_dispatch_ready events = %', n;
END $$;
ROLLBACK;
