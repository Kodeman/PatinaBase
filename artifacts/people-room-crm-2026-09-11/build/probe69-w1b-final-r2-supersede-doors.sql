\set ON_ERROR_STOP off
\timing off
BEGIN;
-- ── Probe A: is the supersede CYCLE still reachable after r1 MAJOR-4's fix,
--    and what does the paper word become while both lapsed papers stand?
DO $$
DECLARE
  v_org uuid; v_firm uuid; v_a uuid; v_b uuid; v_c uuid; v_word text;
BEGIN
  INSERT INTO public.organizations (id, type, name, slug, status)
  VALUES (gen_random_uuid(), 'design_studio', 'Probe Studio A', 'probe-studio-a-'||substr(gen_random_uuid()::text,1,8), 'active')
  RETURNING id INTO v_org;

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, company_name)
  VALUES (v_org, 'company', 'sub', 'Cycle Electric') RETURNING id INTO v_firm;

  -- two GENUINELY LAPSED, GATING COIs, same doc_type, SAME expiry date
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl', CURRENT_DATE - 100, ARRAY['site_access','draw'])
  RETURNING id INTO v_a;
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl', CURRENT_DATE - 100, ARRAY['site_access','draw'])
  RETURNING id INTO v_b;

  SELECT public.compliance_state(v_firm) INTO v_word;
  RAISE NOTICE 'A1 before the cycle, two lapsed gating COIs  : %', v_word;

  UPDATE public.studio_compliance_documents SET superseded_by = v_b WHERE id = v_a;
  UPDATE public.studio_compliance_documents SET superseded_by = v_a WHERE id = v_b;
  SELECT public.compliance_state(v_firm) INTO v_word;
  RAISE NOTICE 'A2 after A->B and B->A (same type, same date): %   [lapsed rows still on file: %]',
    v_word, (SELECT count(*) FROM public.studio_compliance_documents
              WHERE holder_id=v_firm AND expires_on < CURRENT_DATE AND cardinality(blocks)>0);

  -- add one undated non-superseded paper and the word becomes CURRENT
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, blocks)
  VALUES (v_org,'company',v_firm,'w9', ARRAY[]::text[]) RETURNING id INTO v_c;
  SELECT public.compliance_state(v_firm) INTO v_word;
  RAISE NOTICE 'A3 cycle + one undated W-9 on file           : %', v_word;
END $$;

-- ── Probe B: the UNDATED SUCCESSOR path. A lapsed, gating COI is "renewed"
--    by a brand-new coi_gl carrying NO expires_on.
DO $$
DECLARE
  v_org uuid; v_firm uuid; v_a uuid; v_new uuid; v_word text;
BEGIN
  INSERT INTO public.organizations (id, type, name, slug, status)
  VALUES (gen_random_uuid(), 'design_studio', 'Probe Studio B', 'probe-studio-b-'||substr(gen_random_uuid()::text,1,8), 'active')
  RETURNING id INTO v_org;
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, company_name)
  VALUES (v_org, 'company', 'sub', 'Undated Electric') RETURNING id INTO v_firm;
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl', DATE '2026-03-31', ARRAY['site_access','draw'])
  RETURNING id INTO v_a;
  SELECT public.compliance_state(v_firm) INTO v_word;
  RAISE NOTICE 'B1 the lapsed COI alone                     : %', v_word;

  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl', ARRAY['site_access','draw'])
  RETURNING id INTO v_new;   -- NO expires_on: a COI that never lapses
  UPDATE public.studio_compliance_documents SET superseded_by = v_new WHERE id = v_a;
  SELECT public.compliance_state(v_firm) INTO v_word;
  RAISE NOTICE 'B2 after an UNDATED coi_gl "renews" it      : %   [the lapsed COI is still on file, dated %]',
    v_word, (SELECT expires_on FROM public.studio_compliance_documents WHERE id=v_a);
END $$;

-- ── Probe C: is expires_on required for any dated doc type?
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.studio_compliance_documents'::regclass
   AND pg_get_constraintdef(oid) ILIKE '%expires_on%';

ROLLBACK;
