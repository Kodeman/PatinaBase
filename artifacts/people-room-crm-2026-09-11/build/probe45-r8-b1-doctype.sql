-- r8 B-1 — the doc_type leg, measured against the PRE-FIX formula on the same
-- two rows. One transaction, ROLLBACKed. Probe objects only; the ledger is read
-- but never written.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.compliance_state_prefix(p_holder_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH RECURSIVE chain(root, root_blocks, succ, depth) AS (
    SELECT d.id, d.blocks, d.superseded_by, 0
      FROM public.studio_compliance_documents d
     WHERE d.holder_id = p_holder_id AND d.superseded_by IS NOT NULL
    UNION ALL
    SELECT c.root, c.root_blocks, s.superseded_by, c.depth + 1
      FROM chain c JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE c.depth < 64
  ),
  retired AS (
    SELECT DISTINCT c.root
      FROM chain c JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
       AND c.root_blocks <@ s.blocks           -- NO doc_type leg: the shipped r7 body
  )
  SELECT CASE
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0 AND d.expires_on IS NOT NULL
                                   AND d.expires_on <  CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (WHERE cardinality(d.blocks) > 0 AND d.expires_on IS NOT NULL
                                   AND d.expires_on <= CURRENT_DATE + 30) > 0 THEN 'lapses_soon'
           ELSE 'current' END
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = p_holder_id
     AND (d.superseded_by IS NULL OR d.id NOT IN (SELECT root FROM retired));
$$;

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by, created_at) VALUES
  ('e8e00000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company','sub',
   'Probe Retype Firm','sub','a0000000-0000-0000-0000-000000000004','2024-01-01');
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('e8e40000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company',
   'e8e00000-0000-4000-8000-000000000001','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 40),
  ('e8e40000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company',
   'e8e00000-0000-4000-8000-000000000001','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 30,  CURRENT_DATE + 300);

UPDATE public.studio_compliance_documents
   SET superseded_by = 'e8e40000-0000-4000-8000-000000000002'
 WHERE id = 'e8e40000-0000-4000-8000-000000000001';
UPDATE public.studio_compliance_documents
   SET doc_type = 'w9' WHERE id = 'e8e40000-0000-4000-8000-000000000002';

SELECT pg_temp.compliance_state_prefix('e8e00000-0000-4000-8000-000000000001') AS pre_fix_word,
       public.compliance_state('e8e00000-0000-4000-8000-000000000001')        AS shipped_word,
       public.compliance_document_state('e8e40000-0000-4000-8000-000000000001') AS lapse_state,
       (SELECT count(*) FROM public.studio_compliance_documents
         WHERE holder_id = 'e8e00000-0000-4000-8000-000000000001'
           AND doc_type = 'coi_gl' AND expires_on >= CURRENT_DATE) AS in_force_coi;
ROLLBACK;
