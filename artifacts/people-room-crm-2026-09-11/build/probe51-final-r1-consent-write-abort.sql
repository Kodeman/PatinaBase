\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated'; END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','',true); END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role)
VALUES ('e1000000-0000-4000-8000-000000000001','ab@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES ('e1000000-0000-4000-8000-000000000001','ab@t.test','AB',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,name,slug,type,created_at,updated_at) VALUES ('e2000000-0000-4000-8000-000000000001','Abort Studio','abort-studio','design_studio',now(),now());
INSERT INTO organization_members (organization_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner','active',now(),now(),now());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('e3000000-0000-4000-8000-000000000001','Job one','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','active',now(),now()),
 ('e3000000-0000-4000-8000-000000000002','Job two','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','active',now(),now());
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status)
VALUES ('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','sub','Moved Sub','612-555-0931','not_asked');
INSERT INTO site_requests (id,project_id,created_by,assignee_party_id,status,due_at,note)
VALUES ('e5000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','awaiting_consent',now()+interval '3 days','x');
DO $$
DECLARE raised text;
BEGIN
  -- Any studio co-member may PATCH project_parties (00584:884-921). project_id
  -- is not on the freeze trigger, and site_requests' own validate trigger only
  -- fires on site_requests writes.
  PERFORM pg_temp.assume_user('e1000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN UPDATE project_parties SET project_id='e3000000-0000-4000-8000-000000000002' WHERE id='e4000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'A1 a studio member moved the seat to the studio''s other job: %', COALESCE(raised,'<allowed>');
  raised := NULL;
  BEGIN PERFORM public.record_channel_consent('e2000000-0000-4000-8000-000000000001','sms','612-555-0931','granted','written','Signed the form','field-sms-v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'A2 record_channel_consent(granted) = %', COALESCE(raised,'<succeeded>');
  PERFORM pg_temp.reset_role();
  raised := NULL;
  BEGIN
    INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status,refusal_unanswered,consented_at,source,evidence,recorded_at)
    VALUES ('e2000000-0000-4000-8000-000000000001','sms','+16125550931','granted',false,now(),'inbound_sms','Replied START',now());
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'A3 the inbound rail''s own service_role grant upsert = %', COALESCE(raised,'<succeeded>');
END $$;
ROLLBACK;
