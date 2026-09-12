\pset pager off
BEGIN;
-- a plain studio member of the seeded studio
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

\echo '=== 0. the fixture fact, as the member sees it ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;

\echo '=== DOOR c: supersede the lapse with a LATER but still-PAST certificate that gates nothing ==='
DO $$
DECLARE v_card uuid; v_old uuid; v_new uuid;
BEGIN
  SELECT id INTO v_card FROM public.studio_contacts WHERE company_name='Northgate Electric';
  SELECT id INTO v_old FROM public.studio_compliance_documents
   WHERE holder_id=v_card AND doc_type='coi_gl' AND superseded_by IS NULL;
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  SELECT organization_id,'company',v_card,'coi_gl', CURRENT_DATE - 5, '{}'::text[]
    FROM public.studio_contacts WHERE id=v_card
  RETURNING id INTO v_new;
  UPDATE public.studio_compliance_documents SET superseded_by=v_new WHERE id=v_old;
  RAISE NOTICE 'gateless later-but-past successor accepted: % -> %', v_old, v_new;
END $$;
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;
\echo '   and the record still holds the 2026-03-31 lapse:'
SELECT doc_type, expires_on, blocks, (superseded_by IS NOT NULL) AS superseded
  FROM public.studio_compliance_documents
 WHERE holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')
 ORDER BY doc_type, expires_on;
ROLLBACK;

BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '=== DOOR d: move the lapsed paper onto ANOTHER firm card in the same studio ==='
DO $$
DECLARE v_card uuid; v_other uuid; v_doc uuid;
BEGIN
  SELECT id INTO v_card FROM public.studio_contacts WHERE company_name='Northgate Electric';
  SELECT id INTO v_other FROM public.studio_contacts
   WHERE entity_kind='company' AND company_name='Great Northern Bank';
  SELECT id INTO v_doc FROM public.studio_compliance_documents
   WHERE holder_id=v_card AND doc_type='coi_gl' AND superseded_by IS NULL;
  UPDATE public.studio_compliance_documents SET holder_id=v_other WHERE id=v_doc;
  RAISE NOTICE 'holder moved: the lapse now belongs to the LENDER';
END $$;
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Great Northern Bank','Dana Kowalski') ORDER BY 1;
ROLLBACK;

BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
\echo '=== DOOR e: one UPDATE of blocks (MINOR-2 re-check) ==='
UPDATE public.studio_compliance_documents SET blocks='{}'
 WHERE holder_id=(SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric');
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY 1;
ROLLBACK;
