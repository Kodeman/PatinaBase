-- W1a close-review r2 — probe 32: RLS / grants matrix on the consent record,
-- and the two RPC doors as a stranger and as a guest. One transaction,
-- ROLLBACKed. Objects and access only.

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a4000000-0000-4000-8000-000000000001', 'r2c-alpha@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4000000-0000-4000-8000-000000000002', 'r2c-beta@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4000000-0000-4000-8000-000000000003', 'r2c-guest@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a4000000-0000-4000-8000-000000000001', 'r2c-alpha@test.invalid', 'Alpha owner', NOW(), NOW()),
  ('a4000000-0000-4000-8000-000000000002', 'r2c-beta@test.invalid',  'Beta owner',  NOW(), NOW()),
  ('a4000000-0000-4000-8000-000000000003', 'r2c-guest@test.invalid', 'Alpha guest', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES
  ('b4000000-0000-4000-8000-00000000000a', 'design_studio', 'R2c Alpha', 'r2c-alpha', 'active', NOW(), NOW()),
  ('b4000000-0000-4000-8000-00000000000b', 'design_studio', 'R2c Beta',  'r2c-beta',  'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('a4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-00000000000a', 'owner', 'active', NOW(), NOW(), NOW()),
  ('a4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-00000000000b', 'owner', 'active', NOW(), NOW(), NOW()),
  ('a4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-00000000000a', 'guest', 'active', NOW(), NOW(), NOW());

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Alpha's owner records a refusal for a number.
SELECT pg_temp.assume_user('a4000000-0000-4000-8000-000000000001');
SELECT public.record_channel_consent(
  'b4000000-0000-4000-8000-00000000000a', 'sms', '+16125550801', 'opted_out',
  'inbound_sms', 'Replied STOP', NULL, NULL);
SELECT pg_temp.reset_role();

\echo '=== RLS / grants matrix on studio_channel_consent ==='
DO $$
DECLARE n int; raised text;
BEGIN
  -- Alpha's own member reads its own verdict.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM public.studio_channel_consent
   WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'alpha owner SELECT on alpha rows: % row(s)', n;
  RAISE NOTICE 'alpha owner channel_consent_status(): %',
    COALESCE(public.channel_consent_status('b4000000-0000-4000-8000-00000000000a','sms','+16125550801'), '<null>');
  PERFORM pg_temp.reset_role();

  -- Beta's owner may not read Alpha's verdict.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM public.studio_channel_consent
   WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'beta owner SELECT on alpha rows: % row(s)', n;
  RAISE NOTICE 'beta owner channel_consent_status() for alpha: %',
    COALESCE(public.channel_consent_status('b4000000-0000-4000-8000-00000000000a','sms','+16125550801'), '<null>');
  PERFORM pg_temp.reset_role();

  -- A guest of Alpha is not an active studio member.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO n FROM public.studio_channel_consent
   WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'alpha GUEST SELECT on alpha rows: % row(s)', n;
  PERFORM pg_temp.reset_role();

  -- Direct writes are not granted to authenticated at all.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.studio_channel_consent SET status = 'granted'
     WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a';
    RAISE NOTICE 'alpha owner direct UPDATE: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'alpha owner direct UPDATE: %', raised;
  END;
  BEGIN
    INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status)
    VALUES ('b4000000-0000-4000-8000-00000000000a', 'sms', '+16125559999', 'granted');
    RAISE NOTICE 'alpha owner direct INSERT: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'alpha owner direct INSERT: %', raised;
  END;
  BEGIN
    DELETE FROM public.studio_channel_consent
     WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a';
    RAISE NOTICE 'alpha owner direct DELETE: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'alpha owner direct DELETE: %', raised;
  END;
  PERFORM pg_temp.reset_role();

  -- Beta's owner cannot record into Alpha's ledger through either RPC.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.record_channel_consent(
      'b4000000-0000-4000-8000-00000000000a', 'sms', '+16125550801', 'granted',
      'written', 'forged', 'v1', NULL);
    RAISE NOTICE 'beta owner record_channel_consent into alpha: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'beta owner record_channel_consent into alpha: %', raised;
  END;
  BEGIN
    PERFORM public.record_channel_reconsent(
      'b4000000-0000-4000-8000-00000000000a', 'sms', '+16125550801',
      'written', 'forged', 'v1', NULL);
    RAISE NOTICE 'beta owner record_channel_reconsent into alpha: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'beta owner record_channel_reconsent into alpha: %', raised;
  END;
  PERFORM pg_temp.reset_role();

  -- A guest of Alpha may not record either.
  PERFORM pg_temp.assume_user('a4000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.record_channel_consent(
      'b4000000-0000-4000-8000-00000000000a', 'sms', '+16125550802', 'granted',
      'written', 'guest', 'v1', NULL);
    RAISE NOTICE 'alpha GUEST record_channel_consent: SUCCEEDED (hole)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT;
    RAISE NOTICE 'alpha GUEST record_channel_consent: %', raised;
  END;
  PERFORM pg_temp.reset_role();

  -- The standing refusal must still be exactly what Alpha recorded.
  SELECT count(*) INTO n FROM public.studio_channel_consent
   WHERE organization_id = 'b4000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550801'
     AND status = 'opted_out' AND refusal_unanswered
     AND opt_out_source = 'inbound_sms' AND opt_out_evidence = 'Replied STOP';
  RAISE NOTICE 'alpha refusal intact after every attempt above: %', (n = 1);
END $$;

\echo '=== anon EXECUTE on the wave RPCs ==='
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec,
       p.prosecdef, p.proconfig::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('record_channel_consent','record_channel_reconsent',
                     'channel_consent_status','project_consent_org',
                     'backfill_channel_consent_from_parties',
                     'normalize_channel_value','channel_value_was_on_sms_rail',
                     'studio_contact_org','project_party_designer')
 ORDER BY p.proname;

\echo '=== RLS enabled + policies on the three new tables ==='
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = c.oid) AS policies,
       c.relacl::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('studio_channel_consent','studio_contact_channels',
                     'studio_person_affiliations','studio_contact_rules')
 ORDER BY c.relname;

ROLLBACK;
