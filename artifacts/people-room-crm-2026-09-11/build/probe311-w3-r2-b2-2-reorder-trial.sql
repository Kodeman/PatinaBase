-- B2-2: does the REORDER (head holder first, retired rows next, superseded_by last)
-- survive (A) an in-force absorbed head and (B) a LAPSED absorbed head?
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.trial(p_head_expiry date, p_label text) RETURNS text AS $$
DECLARE
  v_heads uuid[]; v_succs uuid[]; v_msg text;
  SURV uuid := 'fa200000-0000-4000-8000-000000000001';
  MERG uuid := 'fa200000-0000-4000-8000-000000000002';
BEGIN
  DELETE FROM public.studio_compliance_documents WHERE holder_id IN (SURV, MERG);
  DELETE FROM public.studio_contacts WHERE id IN (SURV, MERG);
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
    (SURV,'b0000000-0000-0000-0000-000000000001','company','sub','Survivor Firm QA','sub','a0000000-0000-0000-0000-000000000004'),
    (MERG,'b0000000-0000-0000-0000-000000000001','company','sub','Absorbed Firm QA','sub','a0000000-0000-0000-0000-000000000004');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
    ('fa400000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company',SURV,'coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-60,CURRENT_DATE+300),
    ('fa400000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company',MERG,'coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-800,p_head_expiry-300),
    ('fa400000-0000-4000-8000-000000000003','b0000000-0000-0000-0000-000000000001','company',MERG,'coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-400,p_head_expiry);
  UPDATE public.studio_compliance_documents SET superseded_by='fa400000-0000-4000-8000-000000000003'
   WHERE id='fa400000-0000-4000-8000-000000000002';

  -- ── the REORDERED block ──
  SELECT array_agg(doc_id ORDER BY doc_id), array_agg(successor_id ORDER BY doc_id)
    INTO v_heads, v_succs
    FROM (
      SELECT DISTINCT ON (d.id) d.id AS doc_id, s.id AS successor_id
        FROM public.studio_compliance_documents d
        JOIN public.studio_compliance_documents s
          ON s.holder_id = SURV AND s.organization_id = d.organization_id
         AND s.doc_type = d.doc_type AND s.superseded_by IS NULL
         AND (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
         AND (d.expires_on IS NULL OR (s.expires_on IS NOT NULL AND s.expires_on >= d.expires_on))
         AND d.blocks <@ s.blocks
       WHERE d.holder_id = MERG AND d.superseded_by IS NULL
       ORDER BY d.id, s.expires_on DESC NULLS LAST, s.id
    ) q;

  IF v_heads IS NOT NULL THEN
    UPDATE public.studio_compliance_documents d
       SET holder_id = SURV, holder_type = 'company' WHERE d.id = ANY (v_heads);
    FOR i IN 1..16 LOOP
      UPDATE public.studio_compliance_documents d
         SET holder_id = SURV, holder_type = 'company'
       WHERE d.holder_id = MERG AND d.superseded_by IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.studio_compliance_documents s
                      WHERE s.id = d.superseded_by AND s.holder_id = SURV);
      EXIT WHEN NOT FOUND;
    END LOOP;
    UPDATE public.studio_compliance_documents d
       SET superseded_by = v_succs[array_position(v_heads, d.id)]
     WHERE d.id = ANY (v_heads);
  END IF;

  RETURN p_label || ': OK — survivor word ' || public.compliance_state(SURV)
      || ' | rows on survivor ' || (SELECT count(*) FROM public.studio_compliance_documents WHERE holder_id=SURV)::text
      || ' | rows left on absorbed ' || (SELECT count(*) FROM public.studio_compliance_documents WHERE holder_id=MERG)::text;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  RETURN p_label || ': FAILED -> ' || v_msg;
END; $$ LANGUAGE plpgsql;

SELECT pg_temp.trial((CURRENT_DATE + 100)::date, 'CASE A in-force head');
SELECT pg_temp.trial((CURRENT_DATE - 30)::date,  'CASE B lapsed head');
ROLLBACK;
