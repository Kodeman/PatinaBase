\set ON_ERROR_STOP on
BEGIN;
-- setup as owner (single transaction, rolled back at the end)
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, company_name, contact_kind, created_by)
VALUES ('cc000000-0000-4000-8000-0000000000a1','b0000000-0000-0000-0000-000000000001',
        'company','Waiver Launder Co','trade','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('dd000000-0000-4000-8000-0000000000a1','b0000000-0000-0000-0000-000000000001',
        'company','cc000000-0000-4000-8000-0000000000a1',
        'lien_waiver_conditional', CURRENT_DATE - 40, ARRAY['draw','payment']::text[]);
\echo '=== word BEFORE, on the record the studio holds ==='
SELECT public.compliance_state('cc000000-0000-4000-8000-0000000000a1') AS word_before;

-- now become a plain studio member through ordinary RLS
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT (select auth.uid()) AS acting_as,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS is_member,
       public.is_org_admin_or_owner('b0000000-0000-0000-0000-000000000001') AS is_admin;

\echo '=== ACT 1: record an UNDATED successor of the same non-dated type, gates carried ==='
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('dd000000-0000-4000-8000-0000000000a2','b0000000-0000-0000-0000-000000000001',
        'company','cc000000-0000-4000-8000-0000000000a1',
        'lien_waiver_conditional', NULL, ARRAY['draw','payment']::text[]);

\echo '=== ACT 2: retire the expired gating waiver with it ==='
UPDATE public.studio_compliance_documents
   SET superseded_by = 'dd000000-0000-4000-8000-0000000000a2'
 WHERE id = 'dd000000-0000-4000-8000-0000000000a1';

\echo '=== word AFTER, and the record that is still on file ==='
SELECT public.compliance_state('cc000000-0000-4000-8000-0000000000a1') AS word_after;
SELECT id, doc_type, expires_on, blocks, superseded_by IS NOT NULL AS retired
  FROM public.studio_compliance_documents
 WHERE holder_id='cc000000-0000-4000-8000-0000000000a1' ORDER BY expires_on NULLS LAST;

\echo '=== the same act with a coi_gl is REFUSED (the dated-type control) ==='
DO $$
BEGIN
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('b0000000-0000-0000-0000-000000000001','company',
          'cc000000-0000-4000-8000-0000000000a1','coi_gl', NULL, ARRAY['draw']::text[]);
  RAISE NOTICE 'control: an undated coi_gl LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'control: undated coi_gl refused -> %', SQLERRM;
END $$;
ROLLBACK;
