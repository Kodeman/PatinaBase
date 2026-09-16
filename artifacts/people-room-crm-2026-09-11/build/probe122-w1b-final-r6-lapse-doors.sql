-- probe122 — r6: re-walk the carried MINOR-2 / MINOR-31 / MINOR-36 family of
-- one-write paths from `lapsed` to `current`, as an ORDINARY studio member,
-- plus the DELETE door nobody has named yet.
\set ON_ERROR_STOP on
\set ADMIN '''a0000000-0000-0000-0000-000000000003'''
BEGIN;
\echo '=== the gating lapse on file ==='
SELECT d.id, sc.company_name, d.doc_type, d.expires_on, d.blocks, d.superseded_by,
       public.compliance_state(d.holder_id) AS word
  FROM public.studio_compliance_documents d
  JOIN public.studio_contacts sc ON sc.id = d.holder_id
 WHERE d.expires_on < CURRENT_DATE AND cardinality(d.blocks) > 0 AND d.superseded_by IS NULL;

CREATE TEMP TABLE lapse AS
SELECT d.id, d.holder_id FROM public.studio_compliance_documents d
 WHERE d.expires_on < CURRENT_DATE AND cardinality(d.blocks) > 0 AND d.superseded_by IS NULL LIMIT 1;
GRANT SELECT ON lapse TO authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', :ADMIN, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

\echo '-- (a) MINOR-31: ONE UPDATE of blocks (not in the trigger UPDATE OF list)'
SAVEPOINT s1;
UPDATE public.studio_compliance_documents SET blocks = '{}'::text[] WHERE id = (SELECT id FROM lapse);
SELECT public.compliance_state((SELECT holder_id FROM lapse)) AS after_blocks_emptied;
ROLLBACK TO s1;

\echo '-- (b) MINOR-36b: ONE UPDATE of expires_on'
SAVEPOINT s2;
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 400 WHERE id = (SELECT id FROM lapse);
SELECT public.compliance_state((SELECT holder_id FROM lapse)) AS after_date_edit;
ROLLBACK TO s2;

\echo '-- (c) NEW: ONE DELETE — the paper the migration says is never deleted'
SAVEPOINT s3;
DELETE FROM public.studio_compliance_documents WHERE id = (SELECT id FROM lapse);
SELECT public.compliance_state((SELECT holder_id FROM lapse)) AS after_delete;
ROLLBACK TO s3;

\echo '-- (d) MINOR-25: a member may claim ANOTHER profile verified the paper'
SAVEPOINT s4;
UPDATE public.studio_compliance_documents
   SET verified_at = now(), verified_by = 'a0000000-0000-0000-0000-000000000004'
 WHERE id = (SELECT id FROM lapse);
SELECT verified_by, verified_at IS NOT NULL AS verified
  FROM public.studio_compliance_documents WHERE id = (SELECT id FROM lapse);
ROLLBACK TO s4;

\echo '-- (e) control: the r1-r4 supersede doors are still closed'
DO $$
DECLARE v_holder uuid; v_id uuid; v_new uuid;
BEGIN
  SELECT id, holder_id INTO v_id, v_holder FROM lapse;
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
    SELECT organization_id, holder_type, holder_id, doc_type, CURRENT_DATE - 5, '{}'::text[]
      FROM public.studio_compliance_documents WHERE id = v_id
    RETURNING id INTO v_new;
    UPDATE public.studio_compliance_documents SET superseded_by = v_new WHERE id = v_id;
    RAISE NOTICE 'SUPERSEDE LANDED — door open';
  EXCEPTION WHEN others THEN RAISE NOTICE 'supersede refused: %', SQLERRM;
  END;
END $$;
RESET ROLE;
ROLLBACK;
