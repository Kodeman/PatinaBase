-- r16 F1 re-measurement — the client_rep added BEFORE the household names a
-- figure. QA r16 reproduced this twice on a fresh reset: Dana Kowalski carried
-- zero project_party_authority rows after both a $2,500 and a $5,000
-- threshold-set. Same shape here, on the seeded book, rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'F1 probe household (no figure yet)', '{}'::uuid[], NULL);

-- the member goes in first, which is the ordinary order of work
SELECT 'F-a seat = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f1',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000a')::text;

SELECT 'F-b grants at add time (the figure is NULL): ' || count(*)::text
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.studio_contact_id = 'd0e10000-0000-0000-0000-000000000004'
   AND pp.project_id = 'd0e00000-0000-0000-0000-00000000000a'
   AND pa.source_household_id = 'aa000000-0000-4000-8000-0000000000f1';

-- and the figure is named afterwards
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f1', 250000)
         IS NOT NULL;

SELECT 'F-c after the figure is set: threshold=' ||
       COALESCE(pa.threshold_cents::text,'<null>') ||
       ' clause=' || pa.source_clause ||
       ' household=' || pa.source_household_id::text ||
       ' open=' || (pa.effective_to IS NULL)::text
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.studio_contact_id = 'd0e10000-0000-0000-0000-000000000004'
   AND pp.project_id = 'd0e00000-0000-0000-0000-00000000000a'
   AND pa.source_household_id = 'aa000000-0000-4000-8000-0000000000f1';

-- raising it MOVES that row rather than opening a second one
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f1', 500000)
         IS NOT NULL;

SELECT 'F-d after raising it: rows=' || count(*)::text ||
       ' threshold=' || max(pa.threshold_cents)::text
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.studio_contact_id = 'd0e10000-0000-0000-0000-000000000004'
   AND pp.project_id = 'd0e00000-0000-0000-0000-00000000000a'
   AND pa.scope = 'money' AND pa.effective_to IS NULL
   AND pa.source_household_id = 'aa000000-0000-4000-8000-0000000000f1';

-- the seeded `client` seat (Chidi decides selections under the agreement) is
-- untouched by any of it: the figure rides the client_rep seat alone (PR-c)
SELECT 'F-e the agreement''s own seat still reads: ' || string_agg(
         pa.scope || '=' || COALESCE(pa.threshold_cents::text,'<no figure>') ||
         ' (' || pa.source_clause || ', household=' ||
         COALESCE(pa.source_household_id::text,'none') || ')', ' | ')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
 WHERE pp.id = 'd0e30000-0000-0000-0000-000000000004'
   AND pa.effective_to IS NULL;

ROLLBACK;
