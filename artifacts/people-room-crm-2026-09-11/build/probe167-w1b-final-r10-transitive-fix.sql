-- r10 probe A3: does a transitive reckoning close MAJOR-1 without reopening
-- r9 MAJOR-1? Same fixture, same writes, both formulas side by side.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.cs_recursive(p_holder uuid, p_today date)
RETURNS text LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain(root, blocks, succ) AS (
    SELECT d.id, d.blocks, d.superseded_by
      FROM public.studio_compliance_documents d WHERE d.holder_id = p_holder
    UNION ALL
    SELECT c.root, c.blocks, s.superseded_by
      FROM chain c JOIN public.studio_compliance_documents s ON s.id = c.succ
  ),
  retired AS (
    SELECT DISTINCT c.root FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE (s.expires_on IS NULL OR s.expires_on >= p_today)
       AND c.blocks <@ s.blocks
  )
  SELECT CASE
    WHEN count(*) = 0 THEN 'not_on_file'
    WHEN count(*) FILTER (WHERE cardinality(d.blocks)>0 AND d.expires_on IS NOT NULL AND d.expires_on <  p_today)      > 0 THEN 'lapsed'
    WHEN count(*) FILTER (WHERE cardinality(d.blocks)>0 AND d.expires_on IS NOT NULL AND d.expires_on <= p_today + 30) > 0 THEN 'lapses_soon'
    ELSE 'current' END
  FROM public.studio_compliance_documents d
  WHERE d.holder_id = p_holder AND d.id NOT IN (SELECT root FROM retired);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.cs_recursive(uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

DO $$
DECLARE v_org uuid := 'b0000000-0000-0000-0000-000000000001'; v_firm uuid; v_b uuid; v_c uuid;
BEGIN
  SELECT id INTO v_firm FROM public.studio_contacts
   WHERE organization_id=v_org AND company_name='Northgate Electric';
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');

  -- CASE 1 — the r9 walk: honest supersede, then back-date + de-gate the successor.
  INSERT INTO public.studio_compliance_documents
    (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE+200,ARRAY['site_access','draw'])
  RETURNING id INTO v_b;
  UPDATE public.studio_compliance_documents SET superseded_by=v_b
   WHERE organization_id=v_org AND holder_id=v_firm AND doc_type='coi_gl' AND expires_on=DATE '2026-03-31';
  RAISE NOTICE 'r9 case, honest supersede   shipped=% recursive=%',
    public.compliance_state(v_firm), pg_temp.cs_recursive(v_firm, CURRENT_DATE);
  UPDATE public.studio_compliance_documents SET expires_on=CURRENT_DATE-1 WHERE id=v_b;
  UPDATE public.studio_compliance_documents SET blocks='{}' WHERE id=v_b;
  RAISE NOTICE 'r9 case, successor gutted   shipped=% recursive=%   (must be lapsed both)',
    public.compliance_state(v_firm), pg_temp.cs_recursive(v_firm, CURRENT_DATE);
END $$;
ROLLBACK;

BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.cs_recursive(p_holder uuid, p_today date)
RETURNS text LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain(root, blocks, succ) AS (
    SELECT d.id, d.blocks, d.superseded_by
      FROM public.studio_compliance_documents d WHERE d.holder_id = p_holder
    UNION ALL
    SELECT c.root, c.blocks, s.superseded_by
      FROM chain c JOIN public.studio_compliance_documents s ON s.id = c.succ
  ),
  retired AS (
    SELECT DISTINCT c.root FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE (s.expires_on IS NULL OR s.expires_on >= p_today)
       AND c.blocks <@ s.blocks
  )
  SELECT CASE
    WHEN count(*) = 0 THEN 'not_on_file'
    WHEN count(*) FILTER (WHERE cardinality(d.blocks)>0 AND d.expires_on IS NOT NULL AND d.expires_on <  p_today)      > 0 THEN 'lapsed'
    WHEN count(*) FILTER (WHERE cardinality(d.blocks)>0 AND d.expires_on IS NOT NULL AND d.expires_on <= p_today + 30) > 0 THEN 'lapses_soon'
    ELSE 'current' END
  FROM public.studio_compliance_documents d
  WHERE d.holder_id = p_holder AND d.id NOT IN (SELECT root FROM retired);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.cs_recursive(uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;
DO $$
DECLARE v_org uuid := 'b0000000-0000-0000-0000-000000000001'; v_firm uuid; v_b uuid; v_c uuid;
BEGIN
  SELECT id INTO v_firm FROM public.studio_contacts
   WHERE organization_id=v_org AND company_name='Northgate Electric';
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000003');
  -- CASE 2 — two honest renewals, then the calendar
  INSERT INTO public.studio_compliance_documents
    (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE,ARRAY['site_access','draw']) RETURNING id INTO v_b;
  UPDATE public.studio_compliance_documents SET superseded_by=v_b
   WHERE organization_id=v_org AND holder_id=v_firm AND doc_type='coi_gl' AND expires_on=DATE '2026-03-31';
  INSERT INTO public.studio_compliance_documents
    (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE+400,ARRAY['site_access','draw']) RETURNING id INTO v_c;
  UPDATE public.studio_compliance_documents SET superseded_by=v_c WHERE id=v_b;
  RAISE NOTICE 'chain A->B->C  today       shipped=% recursive=%',
    public.compliance_state(v_firm), pg_temp.cs_recursive(v_firm, CURRENT_DATE);
  RAISE NOTICE 'chain A->B->C  TOMORROW    shipped=%(as-of) recursive=%   (must be current both)',
    'see probe161', pg_temp.cs_recursive(v_firm, CURRENT_DATE+1);
  RAISE NOTICE 'chain A->B->C  in 100 days recursive=%', pg_temp.cs_recursive(v_firm, CURRENT_DATE+100);
END $$;
ROLLBACK;
