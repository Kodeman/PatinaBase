\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- a household in the seeded studio, with a figure
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, member_person_ids, primary_member_person_id, co_threshold_cents)
VALUES ('f8c00000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Probe household',
        ARRAY['d0e10000-0000-0000-0000-000000000005'::uuid], 'd0e10000-0000-0000-0000-000000000005', 250000);
-- one merge row so the lineage table is non-empty for the outsider read
INSERT INTO public.studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
VALUES ('b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000004','d0e10000-0000-0000-0000-000000000005','manual');

\echo '=== D1. OUTSIDER (Phase One Synthetic Studio owner) reads ==='
SELECT pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
SELECT (SELECT count(*) FROM public.client_households) households,
       (SELECT count(*) FROM public.studio_contact_merges) merges,
       (SELECT count(*) FROM public.studio_compliance_notices) notices,
       (SELECT count(*) FROM public.project_party_authority) authority,
       (SELECT count(*) FROM public.people_directory WHERE display_name LIKE '%Okonkwo%') directory_okonkwo;
\echo '-- outsider RPC answers --'
SELECT public.resolve_merged_contact('d0e10000-0000-0000-0000-000000000005') AS resolve,
       public.compliance_document_state((SELECT id FROM public.studio_compliance_documents LIMIT 1)) AS doc_state;
DO $$ BEGIN PERFORM public.add_household_member('f8c00000-0000-4000-8000-000000000001','d0e10000-0000-0000-0000-000000000004','client',NULL);
  RAISE NOTICE 'D1 add_household_member as outsider: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D1 add_household_member as outsider refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.set_household_threshold('f8c00000-0000-4000-8000-000000000001', 999);
  RAISE NOTICE 'D1 set_household_threshold as outsider: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D1 set_household_threshold as outsider refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.merge_studio_contacts('d0e10000-0000-0000-0000-000000000004','d0e10000-0000-0000-0000-000000000005','manual');
  RAISE NOTICE 'D1 merge as outsider: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D1 merge as outsider refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.archive_studio_contact('d0e10000-0000-0000-0000-000000000005');
  RAISE NOTICE 'D1 archive as outsider: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D1 archive as outsider refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.sweep_compliance_expiries();
  RAISE NOTICE 'D1 sweep as authenticated: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D1 sweep as authenticated refused: %', SQLERRM; END $$;
SELECT pg_temp.reset_role();

\echo '=== D2. PLAIN MEMBER (studio_manager is admin here; use a member-only user) ==='
-- studio_manager a0…0003 is ADMIN of b0…0001; make a plain member
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','member','active')
ON CONFLICT DO NOTHING;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN UPDATE public.client_households SET co_threshold_cents = 1 WHERE id='f8c00000-0000-4000-8000-000000000001';
  RAISE NOTICE 'D2 member RAISED the figure: rows=%', (SELECT co_threshold_cents FROM public.client_households WHERE id='f8c00000-0000-4000-8000-000000000001');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member raise refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE public.client_households SET co_threshold_cents = NULL WHERE id='f8c00000-0000-4000-8000-000000000001';
  RAISE NOTICE 'D2 member ERASED the figure (rows affected checked next)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member erase refused: %', SQLERRM; END $$;
DO $$ BEGIN INSERT INTO public.studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
  VALUES ('b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000004','d0e10000-0000-0000-0000-000000000006','manual');
  RAISE NOTICE 'D2 member forged lineage: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member lineage INSERT refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE public.studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000004' WHERE id='d0e10000-0000-0000-0000-000000000005';
  RAISE NOTICE 'D2 member set merged_into: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member merged_into PATCH refused: %', SQLERRM; END $$;
DO $$ BEGIN INSERT INTO public.studio_compliance_notices (organization_id, document_id, state, expires_on)
  SELECT organization_id, id, 'lapsed', CURRENT_DATE FROM public.studio_compliance_documents LIMIT 1;
  RAISE NOTICE 'D2 member wrote a notice: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member notice INSERT refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.archive_studio_contact('d0e10000-0000-0000-0000-000000000005');
  RAISE NOTICE 'D2 member archived a card: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D2 member archive refused: %', SQLERRM; END $$;
SELECT pg_temp.reset_role();

\echo '=== D3. ADMIN sets merged_into by hand ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
DO $$ BEGIN UPDATE public.studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000004' WHERE id='d0e10000-0000-0000-0000-000000000005';
  RAISE NOTICE 'D3 admin set merged_into: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D3 admin merged_into PATCH refused: %', SQLERRM; END $$;
SELECT pg_temp.reset_role();

\echo '=== D4. no company into a person, both directions ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$ BEGIN PERFORM public.merge_studio_contacts('d0e10000-0000-0000-0000-000000000004','d0e20000-0000-0000-0000-000000000003','manual');
  RAISE NOTICE 'D4 firm into NON-sole-prop person: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D4 firm into non-sole-prop person refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.merge_studio_contacts('d0e20000-0000-0000-0000-000000000003','d0e10000-0000-0000-0000-000000000011','manual');
  RAISE NOTICE 'D4 person into firm: SUCCEEDED (bad)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D4 person into firm refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.merge_studio_contacts('d0e10000-0000-0000-0000-000000000011','d0e20000-0000-0000-0000-000000000003','manual');
  RAISE NOTICE 'D4 firm into SOLE-PROP person (Dana): SUCCEEDED (expected)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'D4 firm into sole-prop person refused: %', SQLERRM; END $$;
SELECT pg_temp.reset_role();
ROLLBACK;
