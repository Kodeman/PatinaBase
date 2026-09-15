-- r16 probe E — the room's own acts put one card in two households:
-- fold a duplicate client card that the other household already names.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- H1 names Adaeze; H2 names a duplicate card of Adaeze
INSERT INTO studio_contacts (id, organization_id, entity_kind, full_name,
                             contact_kind, created_by)
VALUES ('aa000000-0000-4000-8000-00000000e001',
        'b0000000-0000-0000-0000-000000000001', 'person', 'Adaeze Okonkwo (dup)',
        'client', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-00000000e011',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004','H one',
        ARRAY['d0e10000-0000-0000-0000-000000000004']::uuid[], 250000),
       ('aa000000-0000-4000-8000-00000000e012',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004','H two',
        ARRAY['aa000000-0000-4000-8000-00000000e001']::uuid[], 900000);

SELECT 'E-a merge -> ' || public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000004',
  'aa000000-0000-4000-8000-00000000e001', 'manual')::text;

SELECT 'E-b households naming the survivor after the fold: ' || count(*)::text
       || ' (' || string_agg(display_name || '=' || co_threshold_cents::text, ', '
                             ORDER BY display_name) || ')'
  FROM client_households
 WHERE 'd0e10000-0000-0000-0000-000000000004'::uuid = ANY (member_person_ids);
ROLLBACK;
