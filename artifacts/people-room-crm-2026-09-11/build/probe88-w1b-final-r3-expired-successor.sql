\pset pager off
-- Variant 1: successor ALREADY EXPIRED, blocks left at the column DEFAULT ('{}')
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '--- V1: two ordinary writes, blocks never mentioned (column default) ---'
WITH card AS (SELECT id, organization_id FROM public.studio_contacts WHERE company_name='Northgate Electric'),
ins AS (
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on)
  SELECT organization_id,'company',id,'coi_gl','Acme Mutual', CURRENT_DATE - 5 FROM card
  RETURNING id)
UPDATE public.studio_compliance_documents d SET superseded_by=(SELECT id FROM ins)
 WHERE d.holder_id=(SELECT id FROM card) AND d.doc_type='coi_gl' AND d.superseded_by IS NULL
   AND d.expires_on='2026-03-31';
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;
SELECT ps.display_name, ps.project_name, ps.paper_state FROM public.people_directory_seats ps
 WHERE ps.display_name='Dana Kowalski';
ROLLBACK;

-- Variant 2: the same successor, but carrying the SAME gates
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '--- V2: identical act, but the new certificate carries the gates ---'
WITH card AS (SELECT id, organization_id FROM public.studio_contacts WHERE company_name='Northgate Electric'),
ins AS (
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on, blocks)
  SELECT organization_id,'company',id,'coi_gl','Acme Mutual', CURRENT_DATE - 5,
         ARRAY['site_access','draw'] FROM card
  RETURNING id)
UPDATE public.studio_compliance_documents d SET superseded_by=(SELECT id FROM ins)
 WHERE d.holder_id=(SELECT id FROM card) AND d.doc_type='coi_gl' AND d.superseded_by IS NULL
   AND d.expires_on='2026-03-31';
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;
ROLLBACK;

-- Variant 3: an honest renewal (future date, gates left at default)
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '--- V3: an HONEST renewal, gates left at the default ---'
WITH card AS (SELECT id, organization_id FROM public.studio_contacts WHERE company_name='Northgate Electric'),
ins AS (
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on)
  SELECT organization_id,'company',id,'coi_gl','Acme Mutual', CURRENT_DATE + 300 FROM card
  RETURNING id)
UPDATE public.studio_compliance_documents d SET superseded_by=(SELECT id FROM ins)
 WHERE d.holder_id=(SELECT id FROM card) AND d.doc_type='coi_gl' AND d.superseded_by IS NULL
   AND d.expires_on='2026-03-31';
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;
ROLLBACK;
