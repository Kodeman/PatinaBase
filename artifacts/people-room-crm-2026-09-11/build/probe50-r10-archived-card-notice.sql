-- PROBE A: does the nightly sweep announce a paper held by an ARCHIVED card?
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS VOID AS $$
BEGIN PERFORM set_config('role','authenticated',true);
PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text,true);
EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;

INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fa000000-0000-4000-8000-00000000000a','design_studio','Probe Studio A','probe-studio-a','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fa000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role='owner', status='active';

INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by,archived_at) VALUES
 ('fa200000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','company','sub','Put Away Co','sub','a0000000-0000-0000-0000-000000000004', now());

INSERT INTO public.studio_compliance_documents
 (id,organization_id,holder_type,holder_id,doc_type,blocks,issued_on,expires_on) VALUES
 ('fa400000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','company',
  'fa200000-0000-4000-8000-00000000000a','coi_gl', ARRAY['site_access','payment','draw']::text[],
  '2024-01-01', CURRENT_DATE - 10);

SELECT public.sweep_compliance_expiries() AS sweep_result;

SELECT 'notice for archived card' AS what, count(*) AS n
  FROM public.studio_compliance_notices
 WHERE document_id = 'fa400000-0000-4000-8000-00000000000a';

SELECT 'notification metadata' AS what,
       metadata->>'subject' AS subject,
       metadata->>'message' AS message,
       metadata->>'deep_link' AS deep_link
  FROM public.notification_log
 WHERE type='compliance_document_expiry'
   AND metadata->>'document_id' = 'fa400000-0000-4000-8000-00000000000a';
ROLLBACK;
