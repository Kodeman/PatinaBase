\pset pager off
BEGIN;
SET LOCAL role postgres;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, company_name, contact_kind)
VALUES ('dddd0000-0000-4000-8000-000000000001', :ORG, 'company', 'P302 Probe Firm', 'trade');

CREATE TEMP TABLE res(label text, word text);

-- helper: record one doc, read the word, roll it back
DO $$
DECLARE
  v record;
  v_word text;
BEGIN
  FOR v IN SELECT * FROM (VALUES
      ('expires yesterday',      (CURRENT_DATE - 1)::date, ARRAY['site_access']),
      ('expires today',          (CURRENT_DATE    )::date, ARRAY['site_access']),
      ('expires today+30',       (CURRENT_DATE +30)::date, ARRAY['site_access']),
      ('expires today+31',       (CURRENT_DATE +31)::date, ARRAY['site_access']),
      ('lapsed but GATELESS',    (CURRENT_DATE - 1)::date, ARRAY[]::text[])
    ) AS t(label, d, blocks)
  LOOP
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
    VALUES ('b0000000-0000-0000-0000-000000000001','company',
            'dddd0000-0000-4000-8000-000000000001','coi_gl', v.d, v.blocks);
    SELECT public.compliance_state('dddd0000-0000-4000-8000-000000000001') INTO v_word;
    INSERT INTO res VALUES (v.label, v_word);
    DELETE FROM public.studio_compliance_documents
     WHERE holder_id='dddd0000-0000-4000-8000-000000000001';
  END LOOP;
  SELECT public.compliance_state('dddd0000-0000-4000-8000-000000000001') INTO v_word;
  INSERT INTO res VALUES ('no paper at all', v_word);
END $$;
SELECT * FROM res;

\echo ''
\echo '=== second-renewal chain A -> B -> C, the day B expires (r10 MAJOR-1) ==='
INSERT INTO public.studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('dddd0000-0000-4000-8000-0000000000a1','b0000000-0000-0000-0000-000000000001','company','dddd0000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE - 400, ARRAY['site_access','draw']),
       ('dddd0000-0000-4000-8000-0000000000b1','b0000000-0000-0000-0000-000000000001','company','dddd0000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE -   1, ARRAY['site_access','draw']),
       ('dddd0000-0000-4000-8000-0000000000c1','b0000000-0000-0000-0000-000000000001','company','dddd0000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 300, ARRAY['site_access','draw']);
UPDATE public.studio_compliance_documents SET superseded_by='dddd0000-0000-4000-8000-0000000000c1' WHERE id='dddd0000-0000-4000-8000-0000000000b1';
-- A was superseded by B before B expired; replay that write with the guard open
SET LOCAL app.consent_legacy_write='off';
UPDATE public.studio_compliance_documents SET superseded_by='dddd0000-0000-4000-8000-0000000000b1' WHERE id='dddd0000-0000-4000-8000-0000000000a1';
SELECT 'A->B->C, B expired yesterday, C in force' AS shape,
       public.compliance_state('dddd0000-0000-4000-8000-000000000001') AS word;
ROLLBACK;
