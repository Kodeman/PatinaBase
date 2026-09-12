-- probe159 — w1b final review r9 fixes, walked independently of the suite.
-- B1 (00627's three project-scoped definer readers), M1 (compliance_state
-- re-reckons a supersede at read), M2 (studio_contact_id's card guard).
-- Read-mostly; every write is rolled back at the end.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '=== A. the shipped predicates, read off the catalog ==='
SELECT p.proname,
       CASE WHEN pg_get_functiondef(p.oid) LIKE '%project_recorded_studio%' THEN 'record'
            WHEN pg_get_functiondef(p.oid) LIKE '%project_tenant_org%'      THEN 'CALLER'
            WHEN pg_get_functiondef(p.oid) LIKE '%studio_contact_org%'      THEN 'record (contact org)'
            ELSE 'n/a' END AS tenant_leg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'access_grants_%'
 ORDER BY 1;

\echo '=== B1. the studio-less job, and the second design studio ==='
-- the working studio mints three ordinary grants on Aspen Loft Refresh
-- (projects.studio_id IS NULL) and one invoice that inherits that
INSERT INTO public.trade_rfq_requests (id, proposal_id, party_id, scope_snapshot, status)
VALUES ('f8200000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-0000000cd001',
        (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
        '{}'::jsonb,'sent');
INSERT INTO public.trade_rfq_tokens (id, rfq_request_id, proposal_id, party_id, token_hash, status, created_by)
VALUES ('f8300000-0000-4000-8000-0000000000ff','f8200000-0000-4000-8000-0000000000ff',
        'b0000000-0000-0000-0000-0000000cd001',
        (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
        repeat('1',64),'active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum, sheet_count, created_by)
VALUES ('f8400000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-0000000000d1',9019,'probe159','probe159-key',repeat('2',64),repeat('3',64),1,'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittals (id, project_id, issue_id, party_display_name, purpose, sent_at, created_by)
VALUES ('f8500000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-0000000000d1','f8400000-0000-4000-8000-0000000000ff','probe159','pricing',now(),'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittal_tokens (id, transmittal_id, project_id, token_hash, status, created_by, last_used_at)
VALUES ('f8600000-0000-4000-8000-0000000000ff','f8500000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-0000000000d1',repeat('4',64),'active','a0000000-0000-0000-0000-000000000004',now());
INSERT INTO public.invoices (id, project_id, designer_id, status, subtotal_cents, total_cents)
VALUES ('f8700000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-000000000004','draft',0,0);
INSERT INTO public.invoice_links (id, invoice_id, token, status, created_by, created_at, last_viewed_at)
VALUES ('f8800000-0000-4000-8000-0000000000ff','f8700000-0000-4000-8000-0000000000ff',repeat('5',64),'active','a0000000-0000-0000-0000-000000000004',now(),now());

-- and the same three on paperwork whose tenant IS recorded (Okonkwo / Cedar Lane)
INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum, sheet_count, created_by)
VALUES ('f8400000-0000-4000-8000-0000000000fe','d0e00000-0000-0000-0000-00000000000a',9020,'probe159 rec','probe159-key-rec',repeat('6',64),repeat('7',64),1,'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittals (id, project_id, issue_id, party_display_name, purpose, sent_at, created_by)
VALUES ('f8500000-0000-4000-8000-0000000000fe','d0e00000-0000-0000-0000-00000000000a','f8400000-0000-4000-8000-0000000000fe','probe159 rec','pricing',now(),'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittal_tokens (id, transmittal_id, project_id, token_hash, status, created_by, last_used_at)
VALUES ('f8600000-0000-4000-8000-0000000000fe','f8500000-0000-4000-8000-0000000000fe','d0e00000-0000-0000-0000-00000000000a',repeat('8',64),'active','a0000000-0000-0000-0000-000000000004',now());
INSERT INTO public.invoices (id, project_id, designer_id, status, subtotal_cents, total_cents)
VALUES ('f8700000-0000-4000-8000-0000000000fe','d0e00000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000004','draft',0,0);
INSERT INTO public.invoice_links (id, invoice_id, token, status, created_by, created_at, last_viewed_at)
VALUES ('f8800000-0000-4000-8000-0000000000fe','f8700000-0000-4000-8000-0000000000fe',repeat('9',64),'active','a0000000-0000-0000-0000-000000000004',now(),now());

-- Z: a plain member of a SECOND design studio the job's designer also owns
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('f1000000-0000-4000-8000-0000000000ff','design_studio','Probe159 Studio','probe159-studio','active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','f1000000-0000-4000-8000-0000000000ff','owner','active',now()),
  ('a0000000-0000-0000-0000-000000000005','f1000000-0000-4000-8000-0000000000ff','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, status='active';

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS z_member_of_working_studio,
       public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004') AS z_design_comember,
       public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')       AS caller_relative_leg,
       public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1')  AS record_leg,
       (SELECT studio_id FROM public.invoices WHERE id='f8700000-0000-4000-8000-0000000000ff') AS studioless_invoice_studio_id;

\echo '--- Z, through the four definer readers and the ledger (studio-less job) ---'
SELECT 'invoice_pay' AS tier, count(*) FROM public.access_grants_invoice_links()       WHERE grant_id='invoice_pay:f8800000-0000-4000-8000-0000000000ff'
UNION ALL SELECT 'plan_link',  count(*) FROM public.access_grants_plan_transmittals()  WHERE grant_id='plan_link:f8600000-0000-4000-8000-0000000000ff'
UNION ALL SELECT 'rfq_link',   count(*) FROM public.access_grants_trade_rfq()          WHERE grant_id='rfq_link:f8300000-0000-4000-8000-0000000000ff'
UNION ALL SELECT 'agreement',  count(*) FROM public.access_grants_trade_agreement_links()
UNION ALL SELECT 'v_access_grants (the three)', count(*) FROM public.v_access_grants
  WHERE grant_id IN ('invoice_pay:f8800000-0000-4000-8000-0000000000ff','plan_link:f8600000-0000-4000-8000-0000000000ff','rfq_link:f8300000-0000-4000-8000-0000000000ff');

\echo '--- the working studio''s ADMIN: the mutation control on RECORDED paperwork ---'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'invoice_pay (recorded)' AS tier, count(*) FROM public.access_grants_invoice_links()      WHERE grant_id='invoice_pay:f8800000-0000-4000-8000-0000000000fe'
UNION ALL SELECT 'plan_link (recorded)', count(*) FROM public.access_grants_plan_transmittals()  WHERE grant_id='plan_link:f8600000-0000-4000-8000-0000000000fe'
UNION ALL SELECT 'invoice_pay (studio-less: the stated cost)', count(*) FROM public.access_grants_invoice_links() WHERE grant_id='invoice_pay:f8800000-0000-4000-8000-0000000000ff'
UNION ALL SELECT 'plan_link (studio-less: the stated cost)',   count(*) FROM public.access_grants_plan_transmittals() WHERE grant_id='plan_link:f8600000-0000-4000-8000-0000000000ff';
SELECT pg_temp.reset_role();

\echo '=== M1. the supersede, re-reckoned at read ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'before' AS step, public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS word;
INSERT INTO public.studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('f9000000-0000-4000-8000-0000000000ff','b0000000-0000-0000-0000-000000000001','company','d0e20000-0000-0000-0000-000000000003','coi_gl',CURRENT_DATE+200,'{site_access,draw}');
UPDATE public.studio_compliance_documents SET superseded_by='f9000000-0000-4000-8000-0000000000ff' WHERE id='d0e50000-0000-0000-0000-000000000006';
SELECT 'write 2: honest supersede' AS step, public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS word;
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE-1 WHERE id='f9000000-0000-4000-8000-0000000000ff';
SELECT 'write 3: successor back-dated' AS step, public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS word;
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE+200 WHERE id='f9000000-0000-4000-8000-0000000000ff';
UPDATE public.studio_compliance_documents SET blocks='{}' WHERE id='f9000000-0000-4000-8000-0000000000ff';
SELECT 'write 4: successor de-gated' AS step, public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS word,
       (SELECT count(*) FROM public.studio_compliance_documents
         WHERE holder_id='d0e20000-0000-0000-0000-000000000003' AND doc_type='coi_gl'
           AND superseded_by IS NULL AND cardinality(blocks)>0
           AND (expires_on IS NULL OR expires_on>=CURRENT_DATE)) AS in_force_gating_coi_gl,
       (SELECT paper_state FROM public.people_directory WHERE display_name='Dana Kowalski' AND role='contact') AS dana_row;
UPDATE public.studio_compliance_documents SET blocks='{site_access,draw}' WHERE id='f9000000-0000-4000-8000-0000000000ff';
SELECT 'gates restored: honest release' AS step, public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS word;
SELECT pg_temp.reset_role();

\echo '=== M2. studio_contact_id must name a card in the project''s own studio ==='
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('fb000000-0000-4000-8000-0000000000ff','f1000000-0000-4000-8000-0000000000ff','person','trade','Probe159 Foreign Card','a0000000-0000-0000-0000-000000000004');
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');  -- owner of BOTH studios
\echo '--- the walked write ---'
DO $$
BEGIN
  UPDATE public.project_parties SET studio_contact_id='fb000000-0000-4000-8000-0000000000ff'
   WHERE id='d0e30000-0000-0000-0000-000000000006';
  RAISE NOTICE 'M2: the foreign card LANDED — still open';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'M2: refused with %', SQLERRM;
END $$;
SELECT (SELECT studio_contact_id FROM public.project_parties WHERE id='d0e30000-0000-0000-0000-000000000006') AS ngozi_stamp_after,
       (SELECT count(*) FROM public.people_directory WHERE person_id='d0e10000-0000-0000-0000-000000000006') AS ngozi_directory_rows,
       (SELECT max(seat_count) FROM public.people_directory WHERE person_id='d0e10000-0000-0000-0000-000000000006') AS claims,
       (SELECT count(*) FROM public.people_directory_seats WHERE person_id='d0e10000-0000-0000-0000-000000000006') AS nests;
\echo '--- the mutation control: the project''s own card, either kind ---'
DO $$
BEGIN
  UPDATE public.project_parties SET studio_contact_id='d0e10000-0000-0000-0000-000000000005'
   WHERE id='d0e30000-0000-0000-0000-000000000006';
  RAISE NOTICE 'M2 control (person card, own studio): landed';
EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'M2 control refused with %', SQLERRM; END $$;
DO $$
BEGIN
  UPDATE public.project_parties SET studio_contact_id='d0e20000-0000-0000-0000-000000000003'
   WHERE id='d0e30000-0000-0000-0000-000000000006';
  RAISE NOTICE 'M2 control (COMPANY card, own studio — 00418 pass D2): landed';
EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'M2 control refused with %', SQLERRM; END $$;
SELECT pg_temp.reset_role();

ROLLBACK;
