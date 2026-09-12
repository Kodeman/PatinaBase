-- probe126 — r6: r5 added the tenant conjunct to the PARTY branch and the
-- seats view. The client, lead, maker and team branches still carry 00594's
-- is_studio_comember() alone. What does a co-member of the designer who is NOT
-- a member of the owning studio read on them?
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('ae100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r6-branches@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id,type,name,slug)
VALUES ('ae200000-0000-4000-8000-000000000001','manufacturer','R6 Branch Org','r6-branch-org')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','owner','active',now()),
 ('ae200000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000004','member','active',now())
ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
\echo '-- premise'
SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember_of_designer,
       public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004') AS design_studio_comember,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev;
\echo '-- what this caller reads from people_directory, by role'
SELECT role, count(*) FROM public.people_directory GROUP BY role ORDER BY role;
\echo '-- the client rows, in full-ish'
SELECT role, display_name, email, phone, reach_state, meta->>'total_revenue' AS revenue
  FROM public.people_directory WHERE role IN ('client','lead','maker','team') ORDER BY role, display_name;
\echo '-- and the objects r5 tightened, for contrast'
SELECT (SELECT count(*) FROM public.people_directory_seats) seats,
       (SELECT count(*) FROM public.project_site_access_cards) cards,
       (SELECT count(*) FROM public.project_party_authority) authority,
       (SELECT count(*) FROM public.studio_compliance_documents) docs;
RESET ROLE;
ROLLBACK;
