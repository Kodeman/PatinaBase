-- r7 probe E: every new object and RPC, as a member of an UNRELATED studio
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.assume_anon() RETURNS VOID AS $$
BEGIN PERFORM set_config('request.jwt.claims',NULL,true); EXECUTE 'SET LOCAL ROLE anon'; END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

-- cf-phase1-alice, owner of Phase One Synthetic Studio, unrelated to Local Dev
SELECT pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

\echo '=== the tables ==='
SELECT (SELECT count(*) FROM public.studio_compliance_documents) AS docs,
       (SELECT count(*) FROM public.project_party_authority)     AS authority,
       (SELECT count(*) FROM public.project_site_access_cards)   AS site_cards,
       (SELECT count(*) FROM public.people_directory_seats)      AS seats,
       (SELECT count(*) FROM public.v_access_grants)             AS grants;

\echo '=== the views, by branch ==='
SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;

\echo '=== the four definer readers ==='
SELECT (SELECT count(*) FROM public.access_grants_trade_rfq())                 AS rfq,
       (SELECT count(*) FROM public.access_grants_trade_agreement_links())     AS agreement,
       (SELECT count(*) FROM public.access_grants_plan_transmittals())         AS plan,
       (SELECT count(*) FROM public.access_grants_invoice_links())             AS invoice;

\echo '=== naming a FOREIGN studio, a foreign card, a foreign project, a foreign seat ==='
SELECT public.compliance_state('d0e20000-0000-0000-0000-000000000003')                AS foreign_firm_paper_word,
       public.identity_paper_state('d0e10000-0000-0000-0000-000000000011',
                                   'd0e20000-0000-0000-0000-000000000003')            AS foreign_identity_paper,
       public.contact_rule_summary('person','d0e10000-0000-0000-0000-000000000015')    AS foreign_rule,
       public.identity_seat_count('d0e10000-0000-0000-0000-000000000011')             AS foreign_seat_count,
       public.project_tenant_org('d0e00000-0000-0000-0000-00000000000a')              AS foreign_tenant,
       public.project_designer('d0e00000-0000-0000-0000-00000000000a')                AS foreign_designer_oracle;
SELECT count(*) AS foreign_numbers FROM public.identity_phone_numbers(
  'b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000011','+16125550111');
SELECT count(*) AS foreign_numbers_naming_my_own_org FROM public.identity_phone_numbers(
  'cf120000-0000-4000-8000-000000000001','d0e10000-0000-0000-0000-000000000011','+16125550111');
SELECT public.identity_consent_status('b0000000-0000-0000-0000-000000000001',
        'd0e10000-0000-0000-0000-000000000011','+16125550111') AS foreign_consent_word;
SELECT count(*) AS foreign_consent_dates FROM public.identity_consent_evidence(
  'b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000011','+16125550111');

\echo '=== can the foreign owner write? ==='
DO $$
BEGIN
  INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','planted');
  RAISE NOTICE 'site access INSERT LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'site access INSERT refused: %', SQLERRM; END $$;
DO $$
BEGIN
  INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000003','coi_gl', CURRENT_DATE+9, '{}');
  RAISE NOTICE 'document INSERT LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'document INSERT refused: %', SQLERRM; END $$;
DO $$
BEGIN
  UPDATE public.project_site_access_cards SET lockbox_version='moved'
   WHERE project_id='d0e00000-0000-0000-0000-00000000000a';
  RAISE NOTICE 'lockbox UPDATE touched % row(s)', (SELECT count(*) FROM public.project_site_access_cards WHERE lockbox_version='moved');
END $$;

\echo '=== anon ==='
SELECT pg_temp.assume_anon();
DO $$ BEGIN PERFORM 1 FROM public.people_directory LIMIT 1; RAISE NOTICE 'anon read people_directory OK (rows unknown)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon people_directory: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.people_directory_seats LIMIT 1; RAISE NOTICE 'anon seats LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon seats: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.v_access_grants LIMIT 1; RAISE NOTICE 'anon grants LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon grants: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.project_site_access_cards LIMIT 1; RAISE NOTICE 'anon site cards LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon site cards: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.compliance_state('d0e20000-0000-0000-0000-000000000003'); RAISE NOTICE 'anon compliance_state LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon compliance_state: %', SQLERRM; END $$;
ROLLBACK;
