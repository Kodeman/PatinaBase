-- r17 probe A — r16 F1's new opening loop has no project scope.
-- Two households on two DIFFERENT jobs, one shared member, NO figure on either
-- at add time (the ordinary order of work r16 F1 is about). Then household ONE
-- names its figure. Does it open a grant on household TWO's job too?
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

INSERT INTO client_households (id, organization_id, designer_id, display_name,
                               member_person_ids, co_threshold_cents)
VALUES ('aa000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Okonkwo r17 household', '{}'::uuid[], NULL),
       ('aa000000-0000-4000-8000-0000000000f2',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004',
        'Lindqvist r17 household', '{}'::uuid[], NULL);

SELECT 'A-a Okonkwo seat   = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f1',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000a')::text;
SELECT 'A-b Lindqvist seat = ' || public.add_household_member(
  'aa000000-0000-4000-8000-0000000000f2',
  'd0e10000-0000-0000-0000-000000000004', 'client_rep',
  'd0e00000-0000-0000-0000-00000000000b')::text;

SELECT 'A-c open money grants before any figure: ' || COALESCE(string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>'), ' | '
         ORDER BY pj.name), 'none')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;

-- ONLY the Okonkwo household names a figure.
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f1', 250000)
         IS NOT NULL;

SELECT 'A-d open money grants after the OKONKWO figure alone: ' || COALESCE(string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>')
           || ' [src_hh=' || COALESCE((SELECT h.display_name FROM client_households h
                                        WHERE h.id = pa.source_household_id),'none') || ']',
         ' | ' ORDER BY pj.name), 'none')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;

SELECT 'A-e Lindqvist household record still says: ' ||
       COALESCE((SELECT co_threshold_cents FROM client_households
                  WHERE id='aa000000-0000-4000-8000-0000000000f2')::text,'<null>');

-- and can the Lindqvist household ever move the grant standing on ITS OWN job?
SELECT public.set_household_threshold('aa000000-0000-4000-8000-0000000000f2', 900000)
         IS NOT NULL;
SELECT 'A-f after the LINDQVIST figure is set to 900000: ' || COALESCE(string_agg(
         pj.name || '=' || COALESCE(pa.threshold_cents::text,'<null>')
           || ' [src_hh=' || COALESCE((SELECT h.display_name FROM client_households h
                                        WHERE h.id = pa.source_household_id),'none') || ']',
         ' | ' ORDER BY pj.name), 'none')
  FROM project_party_authority pa
  JOIN project_parties pp ON pp.id = pa.engagement_id
  JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.studio_contact_id='d0e10000-0000-0000-0000-000000000004'
   AND pa.scope='money' AND pa.effective_to IS NULL;
ROLLBACK;
