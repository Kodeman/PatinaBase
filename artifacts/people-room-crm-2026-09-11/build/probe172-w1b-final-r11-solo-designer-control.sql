\pset pager off
-- probe172: which leg drops the solo designer's seat, and the control.
BEGIN;
SET LOCAL client_min_messages = notice;
INSERT INTO auth.users (id, email, encrypted_password, invited_at, created_at, updated_at,
                        instance_id, aud, role)
VALUES ('bd000000-0000-4000-8000-0000000000f5','r11-solo@test.invalid','',NOW(),NOW(),NOW(),
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES ('bd000000-0000-4000-8000-0000000000f6','R11 Solo Project',
        'bd000000-0000-4000-8000-0000000000f5','bd000000-0000-4000-8000-0000000000f5',NULL);
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, show_to_client)
VALUES ('bd000000-0000-4000-8000-0000000000f7','bd000000-0000-4000-8000-0000000000f6',
        'gc','R11 Solo GC',false);

DO $$
DECLARE v_com bool; v_ten bool; v_pre int; v_post int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','bd000000-0000-4000-8000-0000000000f5','role','authenticated')::text, true);

  SELECT public.is_studio_comember('bd000000-0000-4000-8000-0000000000f5') INTO v_com;
  SELECT public.is_active_studio_member(
           public.project_tenant_org('bd000000-0000-4000-8000-0000000000f6')) INTO v_ten;
  RAISE NOTICE 'co-member leg (their own designer id) = %   tenant leg = %', v_com, v_ten;

  -- v4's predicate, inline
  SELECT count(*) INTO v_post
    FROM public.project_parties pp JOIN public.projects pj ON pj.id = pp.project_id
   WHERE pp.id = 'bd000000-0000-4000-8000-0000000000f7'
     AND public.party_kind_in_directory(pp.party_kind)
     AND pp.studio_contact_id IS NULL
     AND public.is_active_studio_member(public.project_tenant_org(pp.project_id))
     AND ( public.is_studio_comember(pj.designer_id)
        OR public.is_studio_comember(pj.lead_designer_id)
        OR public.is_studio_comember(pj.created_by) );
  RAISE NOTICE 'v4 party-branch predicate (WITH the tenant leg): % row(s)', v_post;

  -- 00594's predicate, the shipped one, inline: no tenant leg
  SELECT count(*) INTO v_pre
    FROM public.project_parties pp JOIN public.projects pj ON pj.id = pp.project_id
   WHERE pp.id = 'bd000000-0000-4000-8000-0000000000f7'
     AND pp.party_kind IN ('gc','sub','installer','receiver','architect','photographer','stager')
     AND ( public.is_studio_comember(pj.designer_id)
        OR public.is_studio_comember(pj.lead_designer_id)
        OR public.is_studio_comember(pj.created_by) );
  RAISE NOTICE 'CONTROL — 00594 party-branch predicate (no tenant leg): % row(s)  <-- what shipped', v_pre;
  RESET ROLE;
END $$;
ROLLBACK;
