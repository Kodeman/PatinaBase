-- r17 probe B — ONE household, no fold, no second household.
-- The member also holds a hand-made client_rep seat on another of the studio's
-- jobs (the room's own "Add to the roster"). Does the household's figure act
-- open a money grant there too?
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f3',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Okonkwo r17b household', '{}'::uuid[], NULL);

SELECT 'B-a household seat (Okonkwo) = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f3',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000a')::text;

-- a plain roster add on ANOTHER job, no household involved at all
INSERT INTO project_parties (project_id, party_kind, display_name,
                             studio_contact_id, created_by)
VALUES ('d0e00000-0000-0000-0000-00000000000b', 'client_rep', 'Chidi Okonkwo',
        'd0e10000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000004');

SELECT 'B-b open money grants before the figure: ' || COALESCE(string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>'), ' | '
         ORDER BY pj.name), 'none')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;

SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f3', 250000)
         IS NOT NULL;

SELECT 'B-c open money grants after the figure: ' || COALESCE(string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>'), ' | '
         ORDER BY pj.name), 'none')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;
ROLLBACK;
