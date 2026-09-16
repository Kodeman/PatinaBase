\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
\set OUT '''cf100000-0000-4000-8000-000000000001'''
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at)
VALUES ('77770000-0000-4000-8000-000000000001', :ORG::uuid,'person','client','X One', :OWNER::uuid, now()-interval '1 year'),
       ('77770000-0000-4000-8000-000000000002', :ORG::uuid,'person','client','X Two', :OWNER::uuid, now());
INSERT INTO client_households (id, organization_id, designer_id, display_name, co_threshold_cents, created_by)
VALUES ('77770000-0000-4000-8000-0000000000b1', :ORG::uuid, :OWNER::uuid, 'X household', 250000, :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','cf100000-0000-4000-8000-000000000001','role','authenticated')::text, true);
DO $$ BEGIN PERFORM public.merge_studio_contacts('77770000-0000-4000-8000-000000000001','77770000-0000-4000-8000-000000000002','manual');
 RAISE NOTICE 'outsider merge: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outsider merge refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.add_household_member('77770000-0000-4000-8000-0000000000b1','77770000-0000-4000-8000-000000000001','client_rep',NULL);
 RAISE NOTICE 'outsider household: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outsider household refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.archive_studio_contact('77770000-0000-4000-8000-000000000001');
 RAISE NOTICE 'outsider archive: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outsider archive refused: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM public.sweep_compliance_expiries();
 RAISE NOTICE 'outsider sweep: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outsider sweep refused: %', SQLERRM; END $$;
DO $$ BEGIN INSERT INTO studio_contact_merges (organization_id, survivor_id, merged_id, matched_on) VALUES ('b0000000-0000-0000-0000-000000000001','77770000-0000-4000-8000-000000000001','77770000-0000-4000-8000-000000000002','manual');
 RAISE NOTICE 'outsider lineage insert: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'outsider lineage refused: %', SQLERRM; END $$;
-- a plain member of the OWNING studio
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
DO $$ BEGIN UPDATE studio_contacts SET merged_into='77770000-0000-4000-8000-000000000001' WHERE id='77770000-0000-4000-8000-000000000002';
 RAISE NOTICE 'member hand-set merged_into: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'member hand-set merged_into refused: %', SQLERRM; END $$;
DO $$ BEGIN INSERT INTO studio_compliance_notices (organization_id, document_id, state) SELECT 'b0000000-0000-0000-0000-000000000001', d.id, 'lapsed' FROM studio_compliance_documents d LIMIT 1;
 RAISE NOTICE 'member notice insert: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'member notice insert refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE client_households SET co_threshold_cents = NULL WHERE id='77770000-0000-4000-8000-0000000000b1';
 RAISE NOTICE 'admin erased the figure: OK'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'erase refused: %', SQLERRM; END $$;
ROLLBACK;
