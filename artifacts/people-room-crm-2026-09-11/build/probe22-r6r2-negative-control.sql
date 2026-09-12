-- r6 round-2 NEGATIVE CONTROL: install the PRE-FIX record_channel_consent body
-- (git HEAD) and replay R6-M1 / R6-M2 / R6-M3 against it. Rolled back.
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'nc-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000f1', 'nc-alice@test.invalid', 'NC Alice', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, name, slug, type)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'NC Studio', 'nc-studio-f1', 'design_studio');
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000f1', 'owner', 'active');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $f$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $f$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $f$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$f$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '### installing the PRE-FIX body (git HEAD) ###'
\i artifacts/people-room-crm-2026-09-11/build/probe22-r6r2-prefix-record_channel_consent.sql

SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000000f1');

\echo ''
\echo '=== R6-M1 (pre-fix): a written grant, then a verbal refusal ==='
SELECT public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','sms','612-555-0490','granted','written','Signed the Lindqvist kickoff form','field-sms-v1',NULL) IS NOT NULL AS grant_ok;
SELECT public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','sms','612-555-0490','opted_out','verbal','He told me on site',NULL,NULL) IS NOT NULL AS refusal_ok;
SELECT status, source AS grant_source_now, evidence AS grant_evidence_now,
       consented_at::date AS granted_on, recorded_at::date AS grant_recorded_at_now
  FROM studio_channel_consent
 WHERE organization_id='b0000000-0000-4000-8000-0000000000f1' AND channel_value='+16125550490';

\echo ''
\echo '=== R6-M2 (pre-fix): a grant with v2, then a refusal with disclosure = empty string ==='
SELECT public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','sms','612-555-0491','granted','written','Signed the 2026 form','v2',NULL) IS NOT NULL AS grant_ok;
SELECT public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','sms','612-555-0491','opted_out','verbal','Asked us to stop','',NULL) IS NOT NULL AS refusal_ok;
SELECT status, COALESCE(NULLIF(disclosure_version,''),'<BLANK>') AS disclosure_version
  FROM studio_channel_consent
 WHERE organization_id='b0000000-0000-4000-8000-0000000000f1' AND channel_value='+16125550491';

\echo ''
\echo '=== R6-M3 (pre-fix): an email refusal, then a fully evidenced grant ==='
SELECT public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','email','dana@example.com','opted_out','verbal','Asked to be taken off the list',NULL,NULL) IS NOT NULL AS refusal_ok;
DO $d$
DECLARE raised TEXT;
BEGIN
  BEGIN
    PERFORM public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','email','dana@example.com','granted','written','Signed the 2026 form','email-v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'email granted over the refusal -> %', COALESCE(raised, 'ACCEPTED');
  BEGIN
    PERFORM public.record_channel_reconsent('b0000000-0000-4000-8000-0000000000f1','email','dana@example.com','written','Signed the 2026 form','email-v1',NULL);
    RAISE NOTICE 'reconsent -> ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'reconsent -> %', SQLERRM; END;
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent('b0000000-0000-4000-8000-0000000000f1','email','dana@example.com','granted','written','Signed the 2026 form','email-v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'email granted after reconsent -> %', COALESCE(raised, 'ACCEPTED');
END $d$;
SELECT channel_kind, channel_value, status, refusal_unanswered
  FROM studio_channel_consent
 WHERE organization_id='b0000000-0000-4000-8000-0000000000f1' AND channel_kind='email';

SELECT pg_temp.reset_role();
ROLLBACK;
