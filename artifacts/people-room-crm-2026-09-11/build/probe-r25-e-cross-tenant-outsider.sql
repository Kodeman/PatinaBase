\pset pager off
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','cf100000-0000-0000-0000-000000000001','role','authenticated')::text, true);
SELECT 'client_households' t, count(*) FROM client_households
UNION ALL SELECT 'studio_contact_merges', count(*) FROM studio_contact_merges
UNION ALL SELECT 'studio_compliance_notices', count(*) FROM studio_compliance_notices
UNION ALL SELECT 'people_directory', count(*) FROM people_directory
UNION ALL SELECT 'studio_channel_consent', count(*) FROM studio_channel_consent;
SELECT 'resolve_merged_contact' t, coalesce(public.resolve_merged_contact('d0e10000-0000-0000-0000-000000000011')::text,'NULL')
UNION ALL SELECT 'compliance_document_state', coalesce(public.compliance_document_state((SELECT id FROM studio_compliance_documents LIMIT 1))::text,'NULL');
DO $$ BEGIN
  BEGIN PERFORM public.merge_studio_contacts('d0e10000-0000-0000-0000-000000000008','d0e10000-0000-0000-0000-000000000012','manual');
    RAISE NOTICE 'merge: LANDED'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'merge refused: %', SQLERRM; END;
  BEGIN PERFORM public.archive_studio_contact('d0e10000-0000-0000-0000-000000000011');
    RAISE NOTICE 'archive: LANDED'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'archive refused: %', SQLERRM; END;
  BEGIN PERFORM public.sweep_compliance_expiries();
    RAISE NOTICE 'sweep: LANDED'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'sweep refused: %', SQLERRM; END;
  BEGIN INSERT INTO public.studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
        VALUES ('b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000008','d0e10000-0000-0000-0000-000000000012','manual');
    RAISE NOTICE 'lineage insert: LANDED'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'lineage insert refused: %', SQLERRM; END;
  BEGIN UPDATE public.studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000008' WHERE id='d0e10000-0000-0000-0000-000000000012';
    RAISE NOTICE 'pointer PATCH: LANDED'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pointer PATCH refused: %', SQLERRM; END;
END $$;
ROLLBACK;
