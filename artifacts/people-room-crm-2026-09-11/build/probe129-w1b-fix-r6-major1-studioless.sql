-- probe129 — r6 MAJOR-1, after the fix. The gate resolves through
-- project_tenant_org() (00624 §1): projects.studio_id when the record names
-- one, else the design studio the CALLER and the job's designer share. Four
-- actors on one studio_id IS NULL project:
--   the ADMIN of the studio doing the work   → must read and may write
--   the OWNER (in both orgs)                 → the carried control
--   a MANUFACTURER-org co-member of the designer → must still read nothing
--   a member of a FOREIGN design studio      → must still read nothing
\set ON_ERROR_STOP on
\set ADMIN  '''a0000000-0000-0000-0000-000000000003'''
\set OWNER  '''a0000000-0000-0000-0000-000000000004'''
\set MFR    '''ac900000-0000-4000-8000-000000000001'''
\set FOREIGN_M '''ac900000-0000-4000-8000-000000000002'''
\set NULLPJ '''b0000000-0000-0000-0000-0000000000d1'''
BEGIN;
\echo '=== premise: the project records no studio, and the two resolvers disagree ==='
SELECT p.name, p.studio_id,
       (SELECT name FROM public.organizations WHERE id = public.project_consent_org(p.id)) AS consent_resolver_names,
       p.designer_id
  FROM public.projects p WHERE p.id = :NULLPJ;
\echo '=== how many local projects record no studio at all ==='
SELECT count(*) FILTER (WHERE studio_id IS NULL) AS studio_id_is_null, count(*) AS all_projects
  FROM public.projects;

-- the two outsiders
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (:MFR::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'r6fix-m1-mfr@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
       (:FOREIGN_M::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'r6fix-m1-foreign@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug) VALUES
  ('ac800000-0000-4000-8000-000000000001','manufacturer','R6M1 Manufacturer','r6fix-m1-mfr'),
  ('ac800000-0000-4000-8000-000000000002','design_studio','R6M1 Foreign Studio','r6fix-m1-foreign')
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
  ('ac800000-0000-4000-8000-000000000001',:MFR::uuid,'owner','active',now()),
  ('ac800000-0000-4000-8000-000000000002',:FOREIGN_M::uuid,'owner','active',now())
ON CONFLICT DO NOTHING;
-- the designer of record consults for the manufacturer org: this is the whole
-- of BLOCKING-1's and MAJOR-2's actor
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
  ('ac800000-0000-4000-8000-000000000001',:OWNER::uuid,'member','active',now())
ON CONFLICT DO NOTHING;

\echo '=== a seat, a site access card and an authority grant on that project, written by service_role ==='
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
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev,
       public.is_active_studio_member(public.project_consent_org(:NULLPJ))   AS member_of_the_guessed_org,
       (SELECT name FROM public.organizations WHERE id = public.project_tenant_org(:NULLPJ)) AS gate_resolver_names;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.people_directory WHERE display_name='R6 Studioless Sub') AS directory_rows,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen,
       (SELECT count(*) FROM public.project_parties WHERE project_id = :NULLPJ) AS raw_seats_seen;
\echo '-- and may the admin RECORD a card on such a project now?'
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
\echo '-- PR-n: the admin may set a MONEY grant, resolved at the studio they administer'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents)
    VALUES ('ac100000-0000-4000-8000-000000000001','money',250000);
    RAISE NOTICE 'admin money grant LANDED';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'admin money grant refused: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo '=== AS THE OWNER (member of both orgs) — the carried control ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :OWNER, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen;
RESET ROLE;

\echo '=== AS A MANUFACTURER-ORG CO-MEMBER of the designer — must read nothing ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :MFR, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.is_studio_comember(:OWNER::uuid)        AS comember_any_org,
       public.is_design_studio_comember(:OWNER::uuid) AS design_studio_comember,
       public.project_tenant_org(:NULLPJ)             AS gate_resolves_to;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
    VALUES ('b0000000-0000-0000-0000-0000000000d3','R6 outsider attempt');
    RAISE NOTICE 'manufacturer-org co-member INSERT LANDED';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'manufacturer-org co-member INSERT refused: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo '=== AS A MEMBER OF A FOREIGN DESIGN STUDIO — must read nothing ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :FOREIGN_M, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id = :NULLPJ) AS seats_seen,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id = :NULLPJ) AS cards_seen,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS grants_seen;
RESET ROLE;

\echo '=== and the studio-SET project is unchanged: the block-13 shape still refused ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :MFR, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats
          WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS seats_on_the_seeded_job,
       (SELECT count(*) FROM public.project_site_access_cards
          WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS cards_on_the_seeded_job;
RESET ROLE;
ROLLBACK;
