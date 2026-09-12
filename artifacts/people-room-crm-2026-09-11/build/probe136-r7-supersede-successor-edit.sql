-- r7 probe A: the supersede invariants under an edit to the SUCCESSOR row
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

\set NG '''d0e20000-0000-0000-0000-000000000003'''
\set A  '''d0e50000-0000-0000-0000-000000000006'''
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set MEMBER '''a0000000-0000-0000-0000-000000000003'''

SELECT pg_temp.assume_user(:MEMBER);

\echo '=== 0. premise: Northgate reads lapsed, the gating COI expired 2026-03-31 ==='
SELECT public.compliance_state(:NG) AS word;

\echo '=== 1. an ordinary member records the renewal WITH its gates, and retires the lapse ==='
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('e7000000-0000-4000-8000-0000000000b1', :ORG, 'company', :NG, 'coi_gl',
        CURRENT_DATE + 365, ARRAY['site_access','draw']::text[]);
UPDATE public.studio_compliance_documents
   SET superseded_by = 'e7000000-0000-4000-8000-0000000000b1' WHERE id = :A;
SELECT public.compliance_state(:NG) AS word_after_a_legitimate_renewal;

\echo '=== 2. the SAME member now empties the successor''s gates — one UPDATE ==='
UPDATE public.studio_compliance_documents SET blocks = '{}'::text[]
 WHERE id = 'e7000000-0000-4000-8000-0000000000b1';
SELECT blocks, expires_on FROM public.studio_compliance_documents
 WHERE id = 'e7000000-0000-4000-8000-0000000000b1';
SELECT public.compliance_state(:NG) AS word_after_the_gates_were_dropped;

\echo '=== 3. and moves the successor''s own expiry into the past ==='
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 1
 WHERE id = 'e7000000-0000-4000-8000-0000000000b1';
SELECT public.compliance_state(:NG) AS word_with_a_lapsed_gateless_successor;

\echo '=== 4. what the record actually holds: no in-force gating general-liability paper ==='
SELECT id, doc_type, expires_on, blocks, superseded_by IS NOT NULL AS retired
  FROM public.studio_compliance_documents WHERE holder_id = :NG ORDER BY doc_type, expires_on;

\echo '=== 5. and what the room prints for Northgate and for a person who carries it ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE person_id IN (:NG, 'd0e10000-0000-0000-0000-000000000011');

\echo '=== 6. control: the same two edits attempted BEFORE the supersede are refused ==='
SELECT pg_temp.assume_user(:MEMBER);
DO $$
BEGIN
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('e7000000-0000-4000-8000-0000000000b2','b0000000-0000-0000-0000-000000000001','company',
          'd0e20000-0000-0000-0000-000000000003','coi_gl', CURRENT_DATE + 200, '{}'::text[]);
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'e7000000-0000-4000-8000-0000000000b2'
     WHERE id = 'd0e50000-0000-0000-0000-000000000007';
    RAISE NOTICE 'control: a gateless successor was ACCEPTED (unexpected)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'control: a gateless successor is refused up front: %', SQLERRM;
  END;
END $$;
ROLLBACK;
