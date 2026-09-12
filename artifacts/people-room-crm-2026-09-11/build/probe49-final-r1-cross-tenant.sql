\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated'; END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','',true); END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role) VALUES
 ('f1000000-0000-4000-8000-00000000000a','tx-a@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-00000000000b','tx-b@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('f1000000-0000-4000-8000-00000000000a','tx-a@t.test','A',now(),now()),
 ('f1000000-0000-4000-8000-00000000000b','tx-b@t.test','B',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,name,slug,type,created_at,updated_at) VALUES
 ('f2000000-0000-4000-8000-00000000000a','Tx A','tx-a','design_studio',now(),now()),
 ('f2000000-0000-4000-8000-00000000000b','Tx B','tx-b','design_studio',now(),now());
INSERT INTO organization_members (organization_id,user_id,role,status,joined_at,created_at,updated_at) VALUES
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-00000000000a','owner','active',now(),now(),now()),
 ('f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-00000000000b','owner','active',now(),now(),now());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('f3000000-0000-4000-8000-00000000000a','A job','f1000000-0000-4000-8000-00000000000a','f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-00000000000a','active',now(),now()),
 ('f3000000-0000-4000-8000-00000000000b','B job','f1000000-0000-4000-8000-00000000000b','f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-00000000000b','active',now(),now());
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone) VALUES
 ('f4000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-00000000000a','sub','Shared Sub','612-555-0911'),
 ('f4000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-00000000000b','sub','Shared Sub','612-555-0911');

DO $$
DECLARE raised text; v text; n int;
BEGIN
  -- A records a REFUSAL; B records a GRANT. Same number, two studios.
  PERFORM pg_temp.assume_user('f1000000-0000-4000-8000-00000000000a');
  PERFORM public.record_channel_consent('f2000000-0000-4000-8000-00000000000a','sms','612-555-0911','opted_out','verbal','Said stop on site',NULL,NULL);
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('f1000000-0000-4000-8000-00000000000b');
  PERFORM public.record_channel_consent('f2000000-0000-4000-8000-00000000000b','sms','612-555-0911','granted','written','Signed B form','field-sms-v1',NULL);
  PERFORM pg_temp.reset_role();

  -- 1. each studio reads its own verdict; neither can read the other's
  PERFORM pg_temp.assume_user('f1000000-0000-4000-8000-00000000000a');
  RAISE NOTICE 'T1 A reads A  = %', COALESCE(public.channel_consent_status('f2000000-0000-4000-8000-00000000000a','sms','+16125550911'),'<null>');
  RAISE NOTICE 'T2 A reads B  = %  (must be <null>)', COALESCE(public.channel_consent_status('f2000000-0000-4000-8000-00000000000b','sms','+16125550911'),'<null>');
  SELECT count(*) INTO n FROM studio_channel_consent WHERE organization_id='f2000000-0000-4000-8000-00000000000b';
  RAISE NOTICE 'T3 A row count on B''s records = %  (must be 0)', n;
  raised := NULL;
  BEGIN PERFORM public.record_channel_consent('f2000000-0000-4000-8000-00000000000b','sms','612-555-0911','opted_out','verbal','cross-tenant',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'T4 A writing B''s record = %', COALESCE(raised,'<NO ERROR — HOLE>');
  raised := NULL;
  BEGIN INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status) VALUES ('f2000000-0000-4000-8000-00000000000b','sms','+16125550911','granted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'T5 A direct INSERT = %', COALESCE(raised,'<NO ERROR — HOLE>');
  -- 2. the roster/room word each studio prints for its own seat
  SELECT sms_consent_status INTO v FROM v_project_roster WHERE roster_id='f4000000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'T6 A''s roster word for A''s seat = %', COALESCE(v,'<null>');
  SELECT count(*) INTO n FROM v_project_roster WHERE roster_id='f4000000-0000-4000-8000-00000000000b';
  RAISE NOTICE 'T7 A''s row count on B''s roster seat = % (must be 0)', n;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('f1000000-0000-4000-8000-00000000000b');
  SELECT sms_consent_status INTO v FROM v_project_roster WHERE roster_id='f4000000-0000-4000-8000-00000000000b';
  RAISE NOTICE 'T8 B''s roster word for B''s seat = % (B granted; A''s STOP must not silence B)', COALESCE(v,'<null>');
  PERFORM pg_temp.reset_role();
  -- 3. anon
  SET LOCAL ROLE anon;
  raised := NULL;
  BEGIN PERFORM public.channel_consent_status('f2000000-0000-4000-8000-00000000000a','sms','+16125550911');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'T9 anon channel_consent_status = %', COALESCE(raised,'<NO ERROR>');
  raised := NULL;
  BEGIN PERFORM count(*) FROM studio_channel_consent;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'T10 anon SELECT on the table = %', COALESCE(raised,'<NO ERROR>');
  RESET ROLE;
END $$;
ROLLBACK;
