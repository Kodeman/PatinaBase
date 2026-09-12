-- r7 probe B: assert_project_party_cards() still resolves through the GUESSING resolver
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- a card in the GUESSED studio (Leah Hartwell), which Local Dev cannot read
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000f1',(SELECT id FROM public.organizations WHERE name='Leah Hartwell' AND type='design_studio' LIMIT 1),'company','trade','Foreign Firm LLC','a0000000-0000-0000-0000-000000000004');

-- a seat on a studio-LESS project (Aspen Loft Refresh, designer = the two-studio owner)
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, trade, phone_e164, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000e1','b0000000-0000-0000-0000-0000000000d1','sub','Studioless Sub','electrical','+16125557777','a0000000-0000-0000-0000-000000000004');

\echo '=== premise: the two resolvers disagree on this project ==='
SELECT (SELECT name FROM public.organizations WHERE id = public.project_consent_org('b0000000-0000-0000-0000-0000000000d1')) AS consent_resolver_names;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT (SELECT name FROM public.organizations WHERE id = public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')) AS gate_resolver_names_for_the_working_admin;

\echo '=== A. the working studio''s ADMIN names their OWN firm card on their own seat ==='
DO $$
BEGIN
  UPDATE public.project_parties
     SET company_id = 'd0e20000-0000-0000-0000-000000000003'   -- Northgate Electric, Local Dev Studio
   WHERE id = 'e7000000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'A: the working studio''s own firm pointer LANDED';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'A: REFUSED — %  (%)', SQLERRM, SQLSTATE;
END $$;

\echo '=== B. the same admin names a card of the GUESSED studio, which they are not a member of ==='
DO $$
BEGIN
  UPDATE public.project_parties
     SET company_id = 'e7000000-0000-4000-8000-0000000000f1'   -- Foreign Firm LLC, Leah Hartwell
   WHERE id = 'e7000000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'B: a FOREIGN studio''s firm pointer LANDED on this studio''s seat';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'B: refused — %', SQLERRM;
END $$;

\echo '=== C. what the working studio now reads on its own seat line ==='
SELECT seat_id, display_name, company_id, paper_state
  FROM public.people_directory_seats WHERE seat_id = 'e7000000-0000-4000-8000-0000000000e1';
SELECT count(*) AS can_the_admin_read_that_card FROM public.studio_contacts
 WHERE id = 'e7000000-0000-4000-8000-0000000000f1';

\echo '=== D. and the warranty contact pointer, same resolver ==='
DO $$
BEGIN
  UPDATE public.project_parties
     SET warranty_contact_person_id = 'd0e10000-0000-0000-0000-000000000011'  -- Dana Kowalski, Local Dev
   WHERE id = 'e7000000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'D: the working studio''s own warranty contact LANDED';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'D: REFUSED — %', SQLERRM;
END $$;

SELECT pg_temp.reset_role();
ROLLBACK;
