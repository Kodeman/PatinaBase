-- probe109 — W1b final review r5, MAJOR-3: what a member of the SECOND studio a
-- designer belongs to reads of the FIRST studio's new objects. The predicate is
-- the brief's own (is_studio_comember(designer_id) / project_designer), the same
-- one project_parties has carried since 00420/00584 — so this measures the
-- BREADTH that predicate gives the wave's new tables, not a coding slip.
\pset pager off
BEGIN;
INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid',
        'authenticated','authenticated','00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, role)
VALUES ('cc000000-0000-4000-8000-0000000000c1','sidestudio@patina.invalid','designer')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('cc000000-0000-4000-8000-0000000000c1','e1c06557-8536-421a-8a10-83e7ce8c22ab',
        'member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cc000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember_of_the_designer,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev_studio;

\echo '=== org-scoped tables: correctly closed ==='
SELECT 'studio_compliance_documents' o, count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'people_directory contacts branch', count(*) FROM public.people_directory WHERE role='contact';

\echo '=== designer-scoped (is_studio_comember) tables: open ==='
SELECT 'project_party_authority' o, count(*) FROM public.project_party_authority
UNION ALL SELECT 'people_directory_seats', count(*) FROM public.people_directory_seats
UNION ALL SELECT 'project_site_access_cards', count(*) FROM public.project_site_access_cards;

\echo '=== the site access card itself ==='
SELECT project_id, lockbox_version, alarm_ref, site_hours,
       key_holder_engagement_id, jsonb_array_length(emergency_lines) AS emergency_lines,
       cardinality(told_refs) AS told
  FROM public.project_site_access_cards;

\echo '=== and the authority grants, with their money thresholds ==='
SELECT scope, threshold_cents, prepares_only FROM public.project_party_authority
 ORDER BY scope, threshold_cents NULLS LAST LIMIT 12;

\echo '=== can they WRITE, too? ==='
DO $$
BEGIN
  UPDATE public.project_site_access_cards SET lockbox_version = 'changed by a foreign studio';
  RAISE NOTICE 'UPDATE landed on % row(s) — write is open as well', (SELECT count(*) FROM public.project_site_access_cards WHERE lockbox_version='changed by a foreign studio');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'UPDATE refused: % (%)', SQLERRM, SQLSTATE; END $$;
ROLLBACK;
