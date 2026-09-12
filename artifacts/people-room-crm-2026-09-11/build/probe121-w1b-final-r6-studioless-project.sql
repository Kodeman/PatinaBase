-- probe121 — r6: what the r5 tenant conjunct does to a project whose
-- studio_id is NULL, where project_consent_org() falls back to
-- _primary_studio_for(designer) and names a DIFFERENT studio than the one
-- doing the work.
\set ON_ERROR_STOP on
\set ADMIN  '''a0000000-0000-0000-0000-000000000003'''
\set OWNER  '''a0000000-0000-0000-0000-000000000004'''
\set NULLPJ '''b0000000-0000-0000-0000-0000000000d1'''
BEGIN;
\echo '=== premise ==='
SELECT :NULLPJ::uuid AS project, p.studio_id,
       public.project_consent_org(p.id) AS resolved,
       (SELECT name FROM public.organizations WHERE id = public.project_consent_org(p.id)) AS resolved_name,
       p.designer_id
  FROM public.projects p WHERE p.id = :NULLPJ;
\echo '-- the admin of the studio actually doing the work'
SELECT set_config('request.jwt.claims', json_build_object('sub', :ADMIN, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev,
       public.is_active_studio_member(public.project_consent_org(:NULLPJ)) AS member_of_the_resolved_org,
       public.is_studio_comember(public.project_designer(:NULLPJ))         AS comember_of_the_designer;
RESET ROLE;

\echo '=== a seat and a site access card on that project, written by service_role ==='
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, trade)
VALUES ('ac100000-0000-4000-8000-000000000001', :NULLPJ, 'sub', 'R6 Studioless Sub', '+16125559991', 'electrical');
INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
VALUES (:NULLPJ, 'R6 lockbox v1');
INSERT INTO public.project_party_authority (engagement_id, scope)
VALUES ('ac100000-0000-4000-8000-000000000001', 'selections');
SELECT 'written' AS ok;

\echo '=== AS THE ADMIN of Local Dev Studio (the studio doing the work) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :ADMIN, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.people_directory WHERE display_name='R6 Studioless Sub') AS directory_rows,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen,
       (SELECT count(*) FROM public.project_parties WHERE project_id = :NULLPJ) AS raw_seats_seen;
\echo '-- and may the admin RECORD a card on such a project at all?'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
    VALUES ('b0000000-0000-0000-0000-0000000000d3','R6 admin attempt');
    RAISE NOTICE 'admin INSERT on a studio-less project LANDED';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'admin INSERT refused: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo '=== AS THE OWNER (member of BOTH orgs) — the control ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :OWNER, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen;
RESET ROLE;
ROLLBACK;
