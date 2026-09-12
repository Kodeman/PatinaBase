\set ON_ERROR_STOP on
\set ng '''d0e20000-0000-0000-0000-000000000003'''
\set actor '''{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}'''
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', :actor, true);
SELECT 'actor is a plain admin of the studio' AS leg,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member;
SELECT 'Northgate before' AS leg, public.compliance_state(:ng) AS word;
SELECT 'the gating lapse' AS leg, id, doc_type, expires_on, blocks
  FROM public.studio_compliance_documents
 WHERE holder_id=:ng AND expires_on < CURRENT_DATE;
DELETE FROM public.studio_compliance_documents
 WHERE holder_id=:ng AND expires_on < CURRENT_DATE;
SELECT 'Northgate after ONE ordinary DELETE' AS leg, public.compliance_state(:ng) AS word;
SELECT 'Dana''s Directory row' AS leg, display_name, paper_state
  FROM public.people_directory WHERE display_name='Dana Kowalski';
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', :actor, true);
INSERT INTO public.studio_compliance_documents
  (organization_id, holder_type, holder_id, doc_type, issuer, issued_on, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','company',:ng,'coi_gl',
        'Renewal Carrier', CURRENT_DATE - 1, CURRENT_DATE + 300,
        ARRAY['site_access','draw']::text[])
RETURNING id AS renewal_id \gset
UPDATE public.studio_compliance_documents
   SET superseded_by = :'renewal_id'
 WHERE holder_id=:ng AND expires_on < CURRENT_DATE AND id <> :'renewal_id';
SELECT 'after a CORRECT renewal (gates carried, in force, dated)' AS leg,
       public.compliance_state(:ng) AS word;
UPDATE public.studio_compliance_documents SET blocks='{}'::text[] WHERE id=:'renewal_id';
SELECT 'after UPDATE SET blocks = {} (trigger silent: blocks not in UPDATE OF)' AS leg,
       public.compliance_state(:ng) AS word;
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 1 WHERE id=:'renewal_id';
SELECT 'after the renewal itself expires (trigger fires, passes)' AS leg,
       public.compliance_state(:ng) AS word;
SELECT 'Dana''s Directory row' AS leg, display_name, paper_state
  FROM public.people_directory WHERE display_name='Dana Kowalski';
SELECT 'what the card actually holds now' AS leg, doc_type, expires_on, blocks, superseded_by IS NOT NULL AS retired
  FROM public.studio_compliance_documents WHERE holder_id=:ng ORDER BY doc_type, expires_on;
ROLLBACK;
