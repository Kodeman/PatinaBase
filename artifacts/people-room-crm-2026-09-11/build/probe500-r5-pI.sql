\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
\set PROJ '''d0e00000-0000-0000-0000-00000000000b'''
INSERT INTO project_parties (id, project_id, party_kind, display_name, created_by)
VALUES ('55550000-0000-4000-8000-000000000001', :PROJ::uuid, 'sub', 'Bid Probe Seat', :OWNER::uuid);
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('55550000-0000-4000-8000-0000000000a1', :ORG::uuid,'person','subcontractor','Estimator Live', :OWNER::uuid),
       ('55550000-0000-4000-8000-0000000000a3', :ORG::uuid,'person','subcontractor','Estimator Gone', :OWNER::uuid);
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('55550000-0000-4000-8000-0000000000a2', :ORG::uuid,'company','subcontractor','A Firm', :OWNER::uuid);
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('55550000-0000-4000-8000-0000000000a4', 'cf120000-0000-4000-8000-000000000001','person','subcontractor','Other Studio', 'cf100000-0000-4000-8000-000000000001');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'merge gone card' AS probe, public.merge_studio_contacts('55550000-0000-4000-8000-0000000000a1','55550000-0000-4000-8000-0000000000a3','manual')::text;
RESET role;
DO $$ BEGIN UPDATE project_parties SET bid_quoted_by_person_id='55550000-0000-4000-8000-0000000000a1' WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID live person: OK'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID live person REFUSED: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE project_parties SET bid_quoted_by_person_id='55550000-0000-4000-8000-0000000000a2' WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID firm card: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID firm card refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE project_parties SET bid_quoted_by_person_id='55550000-0000-4000-8000-0000000000a3' WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID merged card: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID merged card refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE project_parties SET bid_quoted_by_person_id='55550000-0000-4000-8000-0000000000a4' WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID other studio: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID other studio refused: %', SQLERRM; END $$;
-- studio-less project
INSERT INTO project_parties (id, project_id, party_kind, display_name, created_by)
SELECT '55550000-0000-4000-8000-000000000002', p.id, 'sub','Studioless Seat', :OWNER::uuid FROM projects p WHERE p.studio_id IS NULL LIMIT 1;
DO $$ BEGIN UPDATE project_parties SET bid_quoted_by_person_id='55550000-0000-4000-8000-0000000000a1' WHERE id='55550000-0000-4000-8000-000000000002';
 RAISE NOTICE 'BID studioless: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID studioless refused: %', SQLERRM; END $$;
-- constraints
DO $$ BEGIN UPDATE project_parties SET bid_amount_cents=-1 WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID negative: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID negative refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE project_parties SET bid_outcome='pending' WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID bad outcome: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID bad outcome refused: %', SQLERRM; END $$;
DO $$ BEGIN UPDATE project_parties SET bid_due_at=CURRENT_DATE+10, bid_valid_until=CURRENT_DATE+1 WHERE id='55550000-0000-4000-8000-000000000001';
 RAISE NOTICE 'BID inverted window: OK (BAD)'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'BID inverted window refused: %', SQLERRM; END $$;
ROLLBACK;
