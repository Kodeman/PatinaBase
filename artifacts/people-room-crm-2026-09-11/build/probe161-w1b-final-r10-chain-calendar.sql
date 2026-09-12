-- r10 probe A2: the SAME defect with ZERO post-hoc writes — the calendar alone.
-- B expires TODAY (so retiring A with it is in force and legal); C expires in
-- 400 days and retires B (legal, C in force). Nothing is written after that.
-- The reader's own formula is then evaluated with today and with tomorrow.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL role authenticated';
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', p::text, 'role','authenticated')::text);
END $$;

-- the reader's formula verbatim, with the day as a parameter
CREATE OR REPLACE FUNCTION pg_temp.compliance_state_asof(p_holder uuid, p_today date)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0 AND d.expires_on IS NOT NULL AND d.expires_on <  p_today)      > 0 THEN 'lapsed'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0 AND d.expires_on IS NOT NULL AND d.expires_on <= p_today + 30) > 0 THEN 'lapses_soon'
           ELSE 'current' END
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = p_holder
     AND (d.superseded_by IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                          WHERE s.id = d.superseded_by
                            AND (s.expires_on IS NULL OR s.expires_on >= p_today)
                            AND d.blocks <@ s.blocks));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.compliance_state_asof(uuid,date) TO authenticated;

DO $$
DECLARE v_org uuid := 'b0000000-0000-0000-0000-000000000001'; v_firm uuid; v_b uuid; v_c uuid;
BEGIN
  SELECT id INTO v_firm FROM public.studio_contacts
   WHERE organization_id = v_org AND company_name = 'Northgate Electric';
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');  -- plain ADMIN

  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE, ARRAY['site_access','draw'])
  RETURNING id INTO v_b;
  UPDATE public.studio_compliance_documents SET superseded_by = v_b
   WHERE organization_id=v_org AND holder_id=v_firm AND doc_type='coi_gl' AND expires_on=DATE '2026-03-31';

  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE + 400, ARRAY['site_access','draw'])
  RETURNING id INTO v_c;
  UPDATE public.studio_compliance_documents SET superseded_by = v_c WHERE id = v_b;

  RAISE NOTICE 'chain built with 4 honest writes; NOTHING is written from here on.';
  RAISE NOTICE '  cover on file: an in-force gating coi_gl expiring %  (non-superseded: %)',
    CURRENT_DATE + 400,
    (SELECT count(*) FROM public.studio_compliance_documents
      WHERE holder_id=v_firm AND superseded_by IS NULL AND doc_type='coi_gl'
        AND cardinality(blocks)>0 AND expires_on >= CURRENT_DATE);
  RAISE NOTICE '  compliance_state() today          = %', public.compliance_state(v_firm);
  RAISE NOTICE '  the same formula, today           = %', pg_temp.compliance_state_asof(v_firm, CURRENT_DATE);
  RAISE NOTICE '  the same formula, TOMORROW        = %  <-- the calendar alone', pg_temp.compliance_state_asof(v_firm, CURRENT_DATE + 1);
  RAISE NOTICE '  the same formula, in 100 days     = %', pg_temp.compliance_state_asof(v_firm, CURRENT_DATE + 100);
END $$;
ROLLBACK;
