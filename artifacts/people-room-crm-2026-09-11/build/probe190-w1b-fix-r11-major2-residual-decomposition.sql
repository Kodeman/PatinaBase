\pset pager off
-- probe190 — what is LEFT of the Directory's cost after the r11 MAJOR-2 fix.
-- probe177's decomposition, re-run at the same shape (the contacts branch's
-- skeleton, then one reader at a time), so the residual is attributed rather
-- than assumed. Recorded, not a finding of this fix: M2's claim was the
-- rows x seats blow-up, and the curve is now rows x constant.
BEGIN;
SET LOCAL client_min_messages=notice;
INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
SELECT 'b0000000-0000-0000-0000-000000000001','person','sub','Scale P '||g,
       'a0000000-0000-0000-0000-000000000004' FROM generate_series(1,600) g;
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale S '||g,
       '+1612'||lpad((7000000+g)::text,7,'0') FROM generate_series(1,600) g;
ANALYZE public.project_parties; ANALYZE public.studio_contacts;
DO $$
DECLARE t0 timestamptz; t1 timestamptz; n int; d uuid;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id);
  t1:=clock_timestamp(); RAISE NOTICE 'contacts branch skeleton:              % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM ( SELECT public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                        pp.phone_e164, pp.email, pp.id) k, count(*) c
                                  FROM public.project_parties pp
                                  JOIN public.projects pj ON pj.id = pp.project_id
                                 WHERE ( public.is_active_studio_member(public.project_tenant_org(pp.project_id))
                                      OR pj.designer_id = (select auth.uid())
                                      OR pj.lead_designer_id = (select auth.uid())
                                      OR pj.created_by = (select auth.uid()) )
                                   AND ( public.is_studio_comember(pj.designer_id)
                                      OR public.is_studio_comember(pj.lead_designer_id)
                                      OR public.is_studio_comember(pj.created_by) )
                                 GROUP BY 1 ) x;
  t1:=clock_timestamp(); RAISE NOTICE '  the identity_seats CTE, whole:       % identities in %  <-- ONCE, not per row', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id)
     AND public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164) IS NOT NULL;
  t1:=clock_timestamp(); RAISE NOTICE '  + identity_consent_status only:      % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id)
     AND public.identity_paper_state(sc.id, sc.company_id) IS NOT NULL;
  t1:=clock_timestamp(); RAISE NOTICE '  + identity_paper_state only:         % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM public.studio_contacts sc
   WHERE public.is_active_studio_member(sc.organization_id)
     AND public.reach_state_for(sc.profile_id, sc.id, NULL) IS NOT NULL;
  t1:=clock_timestamp(); RAISE NOTICE '  + reach_state_for only:              % rows in %', n, t1-t0;

  t0:=clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT * FROM public.people_directory) s;
  t1:=clock_timestamp(); RAISE NOTICE 'the whole view, SELECT * :             % rows in %', n, t1-t0;
  RESET ROLE;
END $$;
ROLLBACK;
