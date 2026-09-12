-- probe130 — r6 MAJOR-2, the ruling's evidence. The client, lead, maker and
-- team branches of people_directory stay is_studio_comember(designer_id),
-- carried from 00594/00420, and the view's COMMENT now says so branch by
-- branch. The question this probe answers is whether tightening those four
-- branches would CLOSE anything: the same caller reads the same columns
-- straight off designer_clients and leads, whose shipped policies carry the
-- same predicate with SELECT granted to authenticated.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('ae100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r6fix-branches@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id,type,name,slug)
VALUES ('ae200000-0000-4000-8000-000000000001','manufacturer','R6 Branch Org','r6fix-branch-org')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','owner','active',now()),
 ('ae200000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000004','member','active',now())
ON CONFLICT DO NOTHING;

\echo '-- the shipped policies on the base tables of the four branches'
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('designer_clients','leads')
   AND policyname IN ('designer_clients_studio_rw','leads_studio_select');
\echo '-- and the table grants those policies run behind'
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee='authenticated'
   AND table_name IN ('designer_clients','leads') AND privilege_type='SELECT'
 ORDER BY table_name;

SELECT set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
\echo '-- premise'
SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember_of_designer,
       public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004') AS design_studio_comember,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev;
\echo '-- what this caller reads from people_directory, by role (unchanged by this round)'
SELECT role, count(*) FROM public.people_directory GROUP BY role ORDER BY role;
\echo '-- THE VIEW IS NOT THE DOOR: the same names, emails and phones off the BASE TABLES'
SELECT count(*) AS designer_clients_rows FROM public.designer_clients;
SELECT client_name, client_email, client_phone FROM public.designer_clients
 WHERE client_email IS NOT NULL ORDER BY client_name LIMIT 3;
SELECT count(*) AS leads_rows FROM public.leads;
SELECT contact_name, contact_email, contact_phone FROM public.leads
 WHERE contact_email IS NOT NULL ORDER BY contact_name LIMIT 3;
\echo '-- and the objects this wave gates, for contrast'
SELECT (SELECT count(*) FROM public.people_directory_seats) seats,
       (SELECT count(*) FROM public.project_site_access_cards) cards,
       (SELECT count(*) FROM public.project_party_authority) authority,
       (SELECT count(*) FROM public.studio_compliance_documents) docs;
RESET ROLE;
ROLLBACK;
