-- B2-2 reproduction + reorder trial. One transaction, ROLLBACK.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;

-- two firm cards in the seeded studio b0…0001, owner a0…0004
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('fa200000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company','sub','Survivor Firm QA','sub','a0000000-0000-0000-0000-000000000004'),
  ('fa200000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company','sub','Absorbed Firm QA','sub','a0000000-0000-0000-0000-000000000004');

-- survivor holds a CURRENT coi_gl
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('fa400000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company',
   'fa200000-0000-4000-8000-000000000001','coi_gl', ARRAY['site_access']::text[], CURRENT_DATE-60, CURRENT_DATE+300);

-- absorbed holds a renewal CHAIN: predecessor P superseded by head H (H IN FORCE)
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('fa400000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company',
   'fa200000-0000-4000-8000-000000000002','coi_gl', ARRAY['site_access']::text[], CURRENT_DATE-800, CURRENT_DATE-400),
  ('fa400000-0000-4000-8000-000000000003','b0000000-0000-0000-0000-000000000001','company',
   'fa200000-0000-4000-8000-000000000002','coi_gl', ARRAY['site_access']::text[], CURRENT_DATE-400, CURRENT_DATE+100);
UPDATE public.studio_compliance_documents SET superseded_by='fa400000-0000-4000-8000-000000000003'
 WHERE id='fa400000-0000-4000-8000-000000000002';

\echo '=== CASE A: in-force head + retired predecessor, survivor holds current successor ==='
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'fa200000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000002','company_name');
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'CASE A: merge SUCCEEDED';
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'CASE A: merge FAILED -> % / %', SQLERRM, SQLSTATE;
END $$;
ROLLBACK;
