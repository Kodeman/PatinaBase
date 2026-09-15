-- r16 probe B — two households on two DIFFERENT jobs sharing one member.
-- Does moving household TWO's figure move household ONE's job's grant?
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000e1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Okonkwo probe household', '{}'::uuid[], 250000),
       ('aa000000-0000-4000-8000-0000000000e2',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Lindqvist probe household', '{}'::uuid[], 1000000);

-- Chidi reps on the Okonkwo residence under household ONE
SELECT 'B-a Okonkwo seat = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000e1',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000a')::text;

-- and the studio then adds the same person to the OTHER job's household,
-- straight off household-band.tsx's picker (which offers every person card).
SELECT 'B-b Lindqvist seat = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000e2',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000b')::text;

SELECT 'B-c grants after the add: ' || string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>'), ' | '
         ORDER BY pj.name)
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;

-- the Lindqvist household's own figure is raised
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000e2', 2500000)
         IS NOT NULL;

SELECT 'B-d grants after moving the LINDQVIST figure only: ' || string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>'), ' | '
         ORDER BY pj.name)
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;

SELECT 'B-e Okonkwo household still says ' ||
       (SELECT co_threshold_cents FROM client_households
         WHERE id='aa000000-0000-4000-8000-0000000000e1')::text;
ROLLBACK;
