\pset pager off
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member,
       public.is_org_admin_or_owner('b0000000-0000-0000-0000-000000000001') AS admin;

\echo '=== W0. Northgate Electric: the lapsed gating COI ==='
SELECT sc.id AS card, sc.company_name, public.compliance_state(sc.id) AS word
  FROM public.studio_contacts sc WHERE sc.company_name='Northgate Electric';
SELECT d.id, d.doc_type, d.expires_on, d.blocks, d.superseded_by
  FROM public.studio_compliance_documents d
  JOIN public.studio_contacts sc ON sc.id=d.holder_id
 WHERE sc.company_name='Northgate Electric' ORDER BY d.doc_type;

\echo '=== W1. MINOR-31: clear blocks on the lapse (one ordinary member UPDATE) ==='
UPDATE public.studio_compliance_documents d SET blocks='{}'::text[]
 WHERE d.expires_on < CURRENT_DATE AND cardinality(d.blocks)>0
   AND d.holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric');
SELECT public.compliance_state(sc.id) AS word_after_clearing_blocks
  FROM public.studio_contacts sc WHERE sc.company_name='Northgate Electric';
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '=== W2. the holder_id move: reparent the lapse onto another firm card ==='
SELECT public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')) AS before;
UPDATE public.studio_compliance_documents d
   SET holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Granite North')
 WHERE d.expires_on < CURRENT_DATE AND cardinality(d.blocks)>0
   AND d.holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric');
SELECT public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')) AS after_reparent,
       public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Granite North')) AS granite_now;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '=== W3. the expires_on edit in place ==='
UPDATE public.studio_compliance_documents d SET expires_on = CURRENT_DATE + 400
 WHERE d.expires_on < CURRENT_DATE AND cardinality(d.blocks)>0
   AND d.holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric');
SELECT public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')) AS after_date_edit;
ROLLBACK;

BEGIN;
\echo '=== W4. compliance_state 30-day boundaries ==='
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('dddd0000-0000-4000-8000-0000000000d1','b0000000-0000-0000-0000-000000000001','company','sub','Boundary Co','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','company','dddd0000-0000-4000-8000-0000000000d1','coi_gl', CURRENT_DATE - 1, '{draw}');
SELECT 'expires yesterday' AS d, public.compliance_state('dddd0000-0000-4000-8000-0000000000d1') AS w;
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE WHERE holder_id='dddd0000-0000-4000-8000-0000000000d1';
SELECT 'expires today', public.compliance_state('dddd0000-0000-4000-8000-0000000000d1');
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE+30 WHERE holder_id='dddd0000-0000-4000-8000-0000000000d1';
SELECT 'expires +30', public.compliance_state('dddd0000-0000-4000-8000-0000000000d1');
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE+31 WHERE holder_id='dddd0000-0000-4000-8000-0000000000d1';
SELECT 'expires +31', public.compliance_state('dddd0000-0000-4000-8000-0000000000d1');
UPDATE public.studio_compliance_documents SET blocks='{}' WHERE holder_id='dddd0000-0000-4000-8000-0000000000d1';
UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE-1 WHERE holder_id='dddd0000-0000-4000-8000-0000000000d1';
SELECT 'gateless lapse', public.compliance_state('dddd0000-0000-4000-8000-0000000000d1');
ROLLBACK;
