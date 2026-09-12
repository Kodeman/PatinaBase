-- W1b behaviour probe: the room's own reads, as designer@patina.dev, and the
-- two negatives PR-w names. Rolled back; reads only.
\pset pager off
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);

\echo '=== people_directory rows by role ==='
SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;

\echo '=== the contact branch, split by entity_kind (PR-g mixed list) ==='
SELECT meta->>'entity_kind' AS entity_kind, count(*)
  FROM public.people_directory WHERE role='contact'
   AND meta->>'organization_id'='b0000000-0000-0000-0000-000000000001'
 GROUP BY 1 ORDER BY 1;

\echo '=== Dana Kowalski: ONE row, two seats, four words ==='
SELECT display_name, role, seat_count, reach_state, consent_status, paper_state,
       COALESCE(contact_rule_summary,'(no rule on file)') AS rule
  FROM public.people_directory WHERE display_name='Dana Kowalski';
SELECT s.project_name, s.party_kind, s.trade, s.stage, s.on_site_from, s.on_site_to,
       s.consent_status, s.reach_state, s.paper_state
  FROM public.people_directory_seats s
  JOIN public.people_directory d ON d.person_id = s.person_id
 WHERE d.display_name='Dana Kowalski' ORDER BY s.project_name;

\echo '=== the four paper words, on real firms ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Marrow & Sons','Northgate Electric','Lakeshore Painting Co.','Great Northern Bank')
 ORDER BY paper_state, display_name;

\echo '=== every recorded rule, as one line of words ==='
SELECT display_name, contact_rule_summary FROM public.people_directory
 WHERE contact_rule_summary IS NOT NULL
   AND meta->>'organization_id'='b0000000-0000-0000-0000-000000000001'
 ORDER BY display_name;

\echo '=== consent, from the record only (R-AY) ==='
SELECT display_name, consent_status FROM public.people_directory
 WHERE consent_status IS NOT NULL AND consent_status <> 'not_asked'
   AND meta->>'organization_id'='b0000000-0000-0000-0000-000000000001'
 ORDER BY consent_status, display_name;

\echo '=== v_access_grants, by tier ==='
SELECT tier, count(*), count(*) FILTER (WHERE revoked_at IS NULL) AS open
  FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
SELECT count(*) AS grant_ids_that_look_like_a_bearer_token
  FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';

\echo '=== F-08 Erin Sato: the field link ends with the engagement (PR-d/PR-l) ==='
SELECT pj.name, g.expires_at::date AS link_ends, pp.on_site_to, pp.warranty_until
  FROM public.v_access_grants g
  JOIN public.project_parties pp ON pp.id = g.subject_id
  JOIN public.projects pj ON pj.id = pp.project_id
 WHERE g.tier='field_link' AND pp.display_name='Erin Sato' ORDER BY pj.name;
ROLLBACK;

BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a0000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
\echo '=== what a CLIENT account reads (PR-w) ==='
SELECT 'site_access_cards' AS object, count(*) FROM public.project_site_access_cards
UNION ALL SELECT 'compliance_documents', count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'authority_grants', count(*) FROM public.project_party_authority
UNION ALL SELECT 'directory_seats', count(*) FROM public.people_directory_seats
ORDER BY 1;
ROLLBACK;

BEGIN;
SET LOCAL role = 'anon';
\echo '=== what anon reads: refused at the GRANT, before any policy runs ==='
SELECT count(*) FROM public.project_site_access_cards;
ROLLBACK;
