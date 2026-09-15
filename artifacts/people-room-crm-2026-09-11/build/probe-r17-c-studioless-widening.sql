-- r17 probe C — the widened blast radius of r16 F1's loop.
-- A household member holds an open client_rep seat on a STUDIO-LESS job
-- (R-BI's legacy population). Before r16 F1 the figure act only visited grants
-- the household had sourced; now it visits every open client_rep seat the
-- member holds. Can the household's principal still name a figure?
BEGIN;
SET LOCAL ROLE postgres;

-- stage: a studio-less project for the seeded designer, with a client_rep seat
-- carrying the household member's card. (assert_project_party_cards refuses a
-- carded seat there, so the seat is staged uncarded then stamped with the
-- guard off — this is the legacy shape R-BI names, not a write the room makes.)
ALTER TABLE project_parties DISABLE TRIGGER assert_project_party_cards_trg;
ALTER TABLE project_parties DISABLE TRIGGER assert_party_card_not_merged_trg;
INSERT INTO projects (id, name, designer_id, client_id, status, studio_id, created_by)
SELECT 'd0e00000-0000-0000-0000-0000000000f9', 'Legacy studioless job',
       'a0000000-0000-0000-0000-000000000004', p.client_id, p.status, NULL,
       'a0000000-0000-0000-0000-000000000004'
  FROM projects p WHERE p.id='d0e00000-0000-0000-0000-00000000000a';
UPDATE projects SET studio_id = NULL WHERE id='d0e00000-0000-0000-0000-0000000000f9';
INSERT INTO project_parties (project_id, party_kind, display_name, studio_contact_id, created_by)
VALUES ('d0e00000-0000-0000-0000-0000000000f9','client_rep','Chidi Okonkwo',
        'd0e10000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004');
ALTER TABLE project_parties ENABLE TRIGGER assert_project_party_cards_trg;
ALTER TABLE project_parties ENABLE TRIGGER assert_party_card_not_merged_trg;
SELECT 'C-a studio_id of the staged job: ' ||
       COALESCE((SELECT studio_id::text FROM projects WHERE id='d0e00000-0000-0000-0000-0000000000f9'),'<null>');

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f4',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Okonkwo r17c household',
        ARRAY['d0e10000-0000-0000-0000-000000000004']::uuid[], NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

DO $$
BEGIN
  PERFORM public.set_household_threshold('aa000000-0000-4000-8000-0000000000f4', 250000);
  RAISE NOTICE 'C-b the figure act SUCCEEDED';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'C-b the figure act was REFUSED: %', SQLERRM;
END $$;
ROLLBACK;
