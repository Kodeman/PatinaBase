\pset pager off
BEGIN;
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale S '||g,
       '+1612'||lpad((7000000+g)::text,7,'0') FROM generate_series(1,600) g;
ANALYZE public.project_parties;
SELECT set_config('request.jwt.claims',
  json_build_object('sub',(SELECT id::text FROM public.profiles WHERE email='designer@patina.dev'),
                    'role','authenticated')::text, false) \gset
SET LOCAL ROLE authenticated;
\echo '--- identity_seat_count body, inlined, for one card ---'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
  SELECT count(*)::integer
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
   WHERE public.is_active_studio_member(public.project_tenant_org(pp.project_id))
     AND ( public.is_studio_comember(pj.designer_id)
        OR public.is_studio_comember(pj.lead_designer_id)
        OR public.is_studio_comember(pj.created_by) )
     AND public.party_identity_key(pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id)
         = 'c0000000-0000-0000-0000-000000000001';
ROLLBACK;
