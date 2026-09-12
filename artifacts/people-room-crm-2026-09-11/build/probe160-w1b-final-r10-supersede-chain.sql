-- r10 probe A: compliance_state()'s supersede re-reckoning is ONE HOP.
-- An ordinary two-renewal chain (A retired by B in year 1, B retired by C in
-- year 2) makes A re-enter the reckoning as soon as B expires, even though C
-- is in force and carries every gate. Every write below passes all ten guards
-- of assert_compliance_holder() and is an honest studio act.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', p::text, 'role','authenticated')::text);
END $$;

DO $$
DECLARE
  v_org   uuid := 'b0000000-0000-0000-0000-000000000001';   -- Local Dev Studio
  v_firm  uuid;
  v_a uuid; v_b uuid; v_c uuid;
  w text;
BEGIN
  SELECT id INTO v_firm FROM public.studio_contacts
   WHERE organization_id = v_org AND company_name = 'Northgate Electric';
  RAISE NOTICE 'firm = %', v_firm;

  -- studio_manager@patina.dev, a plain ADMIN of the owning studio
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');

  RAISE NOTICE 'A. word before anything: %', public.compliance_state(v_firm);

  -- Year 1 renewal: an honest, in-force coi_gl carrying both gates.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org, 'company', v_firm, 'coi_gl', CURRENT_DATE + 10,
          ARRAY['site_access','draw']) RETURNING id INTO v_b;

  -- retire the fixture's 2026-03-31 lapse with it (all ten guards pass)
  UPDATE public.studio_compliance_documents
     SET superseded_by = v_b
   WHERE organization_id = v_org AND holder_id = v_firm
     AND doc_type = 'coi_gl' AND expires_on = DATE '2026-03-31'
   RETURNING id INTO v_a;
  RAISE NOTICE 'B. after the year-1 renewal (B in force, 10 days left): %',
    public.compliance_state(v_firm);

  -- Year 2 renewal: another honest, in-force coi_gl carrying both gates,
  -- recorded while B is STILL IN FORCE (so compliance_successor_already_lapsed
  -- is satisfied), retiring B.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org, 'company', v_firm, 'coi_gl', CURRENT_DATE + 400,
          ARRAY['site_access','draw']) RETURNING id INTO v_c;
  UPDATE public.studio_compliance_documents SET superseded_by = v_c WHERE id = v_b;
  RAISE NOTICE 'C. chain A->B->C, B still in force: %', public.compliance_state(v_firm);

  -- Time passes: B's own certificate lapses. NOTHING ELSE CHANGES. No write.
  -- (simulated by moving B's expiry into the past; the trigger fires and the
  --  guard body is skipped because B's own superseded_by points at C, which
  --  is in force and carries B's gates — so this is an accepted, honest edit
  --  and the identical state is reached by the calendar with no write at all)
  UPDATE public.studio_compliance_documents
     SET expires_on = CURRENT_DATE - 1 WHERE id = v_b;
  w := public.compliance_state(v_firm);
  RAISE NOTICE 'D. B has now lapsed; C is in force to %: word = %',
    (SELECT expires_on FROM public.studio_compliance_documents WHERE id = v_c), w;

  RAISE NOTICE '   in-force, non-superseded, gating coi_gl on file: %',
    (SELECT count(*) FROM public.studio_compliance_documents
      WHERE holder_id = v_firm AND superseded_by IS NULL
        AND doc_type='coi_gl' AND cardinality(blocks) > 0
        AND expires_on >= CURRENT_DATE);
  RAISE NOTICE '   which rows the reader still counts:';
  FOR w IN
    SELECT format('     %s expires %s blocks %s superseded_by %s',
                  d.id, d.expires_on, d.blocks, coalesce(d.superseded_by::text,'-'))
      FROM public.studio_compliance_documents d
     WHERE d.holder_id = v_firm
       AND (d.superseded_by IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                            WHERE s.id = d.superseded_by
                              AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
                              AND d.blocks <@ s.blocks))
  LOOP RAISE NOTICE '%', w; END LOOP;
END $$;

RESET role;
-- what a reader downstream prints for the firm's crew
DO $$ DECLARE v_firm uuid; BEGIN
  SELECT id INTO v_firm FROM public.studio_contacts
   WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND company_name='Northgate Electric';
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');
  RAISE NOTICE 'E. Dana Kowalski''s Directory paper word: %',
    (SELECT paper_state FROM public.people_directory WHERE display_name='Dana Kowalski' AND role='contact');
END $$;

ROLLBACK;
