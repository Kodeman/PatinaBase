-- r10 fix probe A: the transitive reckoning, and the NEGATIVE CONTROL —
-- the r9 one-hop body restored in the same transaction, on the same fixture.
-- Nothing is written outside this transaction; everything ROLLBACKs.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L',
   json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

DO $$
DECLARE
  v_org  uuid := 'b0000000-0000-0000-0000-000000000001';
  v_firm uuid := 'd0e20000-0000-0000-0000-000000000003';  -- Northgate Electric
  v_a    uuid := 'd0e50000-0000-0000-0000-000000000006';  -- the seeded 2026-03-31 lapse
  v_b uuid; v_c uuid;
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');  -- a plain ADMIN
  RAISE NOTICE 'seeded word: %', public.compliance_state(v_firm);

  -- four honest writes: A retired by B, B retired by C
  INSERT INTO public.studio_compliance_documents
    (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE+10,'{site_access,draw}')
  RETURNING id INTO v_b;
  UPDATE public.studio_compliance_documents SET superseded_by = v_b WHERE id = v_a;
  INSERT INTO public.studio_compliance_documents
    (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE+400,'{site_access,draw}')
  RETURNING id INTO v_c;
  UPDATE public.studio_compliance_documents SET superseded_by = v_c WHERE id = v_b;
  RAISE NOTICE 'chain A->B->C, today          shipped=%', public.compliance_state(v_firm);

  -- the calendar alone: B's own certificate has passed. No write to A, none to C.
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE-1 WHERE id = v_b;
  RAISE NOTICE 'B has lapsed, C in force      shipped=%', public.compliance_state(v_firm);
  RAISE NOTICE '  in-force non-superseded gating coi_gl on file: %',
    (SELECT count(*) FROM public.studio_compliance_documents
      WHERE holder_id=v_firm AND doc_type='coi_gl' AND superseded_by IS NULL
        AND cardinality(blocks)>0 AND (expires_on IS NULL OR expires_on>=CURRENT_DATE));
  RAISE NOTICE '  Dana Kowalski Directory paper word: %',
    (SELECT paper_state FROM public.people_directory
      WHERE display_name='Dana Kowalski' AND role='contact');

  -- and it is still CONDITIONAL: gut the head of the chain
  UPDATE public.studio_compliance_documents SET blocks='{}' WHERE id = v_c;
  RAISE NOTICE 'head of chain gutted          shipped=%', public.compliance_state(v_firm);
  UPDATE public.studio_compliance_documents SET blocks='{site_access,draw}' WHERE id = v_c;
END $$;

-- ── NEGATIVE CONTROL: put the r9 ONE-HOP body back, same rows, same second ──
RESET role;
CREATE OR REPLACE FUNCTION public.compliance_state(p_holder_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL AND d.expires_on < CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL AND d.expires_on <= CURRENT_DATE + 30) > 0 THEN 'lapses_soon'
           ELSE 'current' END
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = p_holder_id
     AND (d.superseded_by IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                          WHERE s.id = d.superseded_by
                            AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
                            AND d.blocks <@ s.blocks));
$$;
DO $$
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');
  RAISE NOTICE 'SAME ROWS, r9 ONE-HOP body    shipped=%  <-- the defect',
    public.compliance_state('d0e20000-0000-0000-0000-000000000003');
  RAISE NOTICE '  Dana Kowalski Directory paper word: %',
    (SELECT paper_state FROM public.people_directory
      WHERE display_name='Dana Kowalski' AND role='contact');
END $$;
ROLLBACK;
