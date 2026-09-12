\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '#################### F1. `blocks` is outside every guard ####################'
\echo '-- Northgate Electric: the fixture lapse (coi_gl expired 2026-03-31, blocks {site_access,draw})'
SELECT pg_temp.reset_role();
SELECT d.id, d.doc_type, d.expires_on, d.blocks, d.superseded_by
  FROM studio_compliance_documents d
  JOIN studio_contacts sc ON sc.id=d.holder_id
 WHERE sc.company_name='Northgate Electric' ORDER BY d.doc_type;
SELECT 'BEFORE: compliance_state(Northgate)' q,
       public.compliance_state((SELECT id FROM studio_contacts WHERE company_name='Northgate Electric')) v;

\echo '-- one ordinary studio-member UPDATE, nothing but `blocks`:'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');   -- plain ADMIN (studio_manager)
UPDATE studio_compliance_documents d
   SET blocks = '{}'::text[]
  FROM studio_contacts sc
 WHERE sc.id = d.holder_id AND sc.company_name='Northgate Electric' AND d.doc_type='coi_gl';
SELECT pg_temp.reset_role();
SELECT 'AFTER blocks=''{}'': compliance_state(Northgate)' q,
       public.compliance_state((SELECT id FROM studio_contacts WHERE company_name='Northgate Electric')) v;
SELECT 'the lapse still on file?' q, (d.expires_on < CURRENT_DATE)::text v
  FROM studio_compliance_documents d JOIN studio_contacts sc ON sc.id=d.holder_id
 WHERE sc.company_name='Northgate Electric' AND d.doc_type='coi_gl';
SELECT 'Dana Kowalski directory paper word now' q, d.paper_state v
  FROM public.people_directory d WHERE d.display_name='Dana Kowalski';
ROLLBACK;

BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '#################### F2. the drops-a-gate guard is supersede-time only ####################'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
-- 1. record an honest in-force renewal carrying the gates
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
SELECT 'aa000000-0000-4000-8000-0000000000f1','b0000000-0000-0000-0000-000000000001','company', sc.id,
       'coi_gl', CURRENT_DATE + 200, ARRAY['site_access','draw']::text[]
  FROM studio_contacts sc WHERE sc.company_name='Northgate Electric';
-- 2. supersede the lapse with it: every r1..r4 guard passes
UPDATE studio_compliance_documents d
   SET superseded_by='aa000000-0000-4000-8000-0000000000f1'
  FROM studio_contacts sc
 WHERE sc.id=d.holder_id AND sc.company_name='Northgate Electric' AND d.doc_type='coi_gl'
   AND d.id <> 'aa000000-0000-4000-8000-0000000000f1';
SELECT pg_temp.reset_role();
SELECT 'after an honest supersede' q, public.compliance_state((SELECT id FROM studio_contacts WHERE company_name='Northgate Electric')) v;
\echo '-- now two more ordinary member writes on the SUCCESSOR, neither guarded:'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
UPDATE studio_compliance_documents SET expires_on = CURRENT_DATE - 1 WHERE id='aa000000-0000-4000-8000-0000000000f1';
SELECT pg_temp.reset_role();
SELECT 'successor back-dated (trigger fires, guard body skipped)' q,
       public.compliance_state((SELECT id FROM studio_contacts WHERE company_name='Northgate Electric')) v;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
UPDATE studio_compliance_documents SET blocks='{}'::text[] WHERE id='aa000000-0000-4000-8000-0000000000f1';
SELECT pg_temp.reset_role();
SELECT 'successor de-gated (trigger does NOT fire)' q,
       public.compliance_state((SELECT id FROM studio_contacts WHERE company_name='Northgate Electric')) v;
SELECT 'in-force gating coi_gl on file?' q, count(*)::text v FROM studio_compliance_documents d
  JOIN studio_contacts sc ON sc.id=d.holder_id
 WHERE sc.company_name='Northgate Electric' AND d.superseded_by IS NULL
   AND d.doc_type='coi_gl' AND d.expires_on >= CURRENT_DATE;
SELECT 'Dana Kowalski directory paper word' q, d.paper_state v FROM public.people_directory d WHERE d.display_name='Dana Kowalski';
ROLLBACK;
