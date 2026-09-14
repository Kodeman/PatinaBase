\set ON_ERROR_STOP on
-- r9 fix controls. M-1: the household still OPENS a grant where none stands,
-- and still MOVES its own. B-2: a firm-into-firm merge still keeps the
-- survivor's own name, and the folded firm's crew keep a closed affiliation
-- rather than none.
BEGIN;
DO $$
DECLARE
  v_org uuid; v_designer uuid; v_uid uuid; v_proj uuid;
  v_card1 uuid; v_card2 uuid; v_hh uuid; v_seat uuid; v_auth uuid;
  v_cents integer; v_src text; v_n integer;
BEGIN
  SELECT p.studio_id, p.designer_id INTO v_org, v_designer
    FROM public.projects p WHERE p.studio_id IS NOT NULL LIMIT 1;
  SELECT p.id INTO v_proj FROM public.projects p WHERE p.studio_id = v_org LIMIT 1;
  SELECT om.user_id INTO v_uid FROM public.organization_members om
   WHERE om.organization_id=v_org AND om.status='active' AND om.role IN ('owner','admin') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid,'role','authenticated')::text, true);

  INSERT INTO public.client_households (organization_id, designer_id, display_name, co_threshold_cents, created_by)
  VALUES (v_org, v_designer, 'The Controls', 250000, v_uid) RETURNING id INTO v_hh;

  -- CONTROL A — no grant stands: the household opens one.
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (v_org,'person','client','Control A', v_uid) RETURNING id INTO v_card1;
  v_seat := public.add_household_member(v_hh, v_card1, 'client_rep', v_proj);
  SELECT threshold_cents, source_clause INTO v_cents, v_src
    FROM public.project_party_authority
   WHERE engagement_id=v_seat AND scope='money' AND effective_to IS NULL;
  RAISE NOTICE 'CONTROL A (no grant standing): % cents, source=%', v_cents, v_src;

  -- CONTROL B — the household's OWN grant stands: the figure moves it.
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (v_org,'person','client','Control B', v_uid) RETURNING id INTO v_card2;
  INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id, created_by)
  VALUES (v_proj, 'client_rep', 'Control B', v_card2, v_uid) RETURNING id INTO v_seat;
  INSERT INTO public.project_party_authority
    (engagement_id, scope, threshold_cents, source_clause, granted_by)
  VALUES (v_seat, 'money', 100, 'client_households.co_threshold_cents', v_uid) RETURNING id INTO v_auth;
  PERFORM public.add_household_member(v_hh, v_card2, 'client_rep', v_proj);
  SELECT threshold_cents, source_clause INTO v_cents, v_src
    FROM public.project_party_authority WHERE id=v_auth;
  SELECT count(*) INTO v_n FROM public.project_party_authority
   WHERE engagement_id=v_seat AND scope='money' AND effective_to IS NULL;
  RAISE NOTICE 'CONTROL B (household''s own grant): % cents, source=%, open rows=%', v_cents, v_src, v_n;
END $$;
ROLLBACK;

-- B-2 control: firm into firm. The survivor keeps its OWN name; the folded
-- firm's crew keep a CLOSED affiliation and their legacy pointer.
BEGIN;
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT om.user_id INTO v_uid
    FROM public.organization_members om
    JOIN public.studio_contacts sc ON sc.organization_id = om.organization_id
   WHERE sc.id = 'd0e20000-0000-0000-0000-000000000003'
     AND om.status='active' AND om.role IN ('owner','admin') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
END $$;

SELECT 'firm-into-firm' AS control,
       public.merge_studio_contacts(
         'd0e20000-0000-0000-0000-000000000002'::uuid,
         'd0e20000-0000-0000-0000-000000000003'::uuid,
         'manual') AS survivor;
SELECT id, entity_kind, company_name, full_name
  FROM public.studio_contacts WHERE id='d0e20000-0000-0000-0000-000000000002';
ROLLBACK;

-- B-2 crew control on the SOLE-PROPRIETOR fold: a third party affiliated with
-- the folded firm keeps a closed row and a pointer that still names it.
BEGIN;
DO $$
DECLARE v_uid uuid; v_other uuid;
BEGIN
  SELECT om.user_id INTO v_uid
    FROM public.organization_members om
    JOIN public.studio_contacts sc ON sc.organization_id = om.organization_id
   WHERE sc.id = 'd0e10000-0000-0000-0000-000000000011'
     AND om.status='active' AND om.role IN ('owner','admin') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  SELECT organization_id, 'person', 'sub', 'Crew Control', v_uid
    FROM public.studio_contacts WHERE id='d0e10000-0000-0000-0000-000000000011'
  RETURNING id INTO v_other;

  INSERT INTO public.studio_person_affiliations
    (person_id, company_id, role_at_firm, from_date, created_by)
  VALUES (v_other, 'd0e20000-0000-0000-0000-000000000003', 'Foreman', '2021-01-01', v_uid);

  PERFORM public.merge_studio_contacts(
    'd0e10000-0000-0000-0000-000000000011'::uuid,
    'd0e20000-0000-0000-0000-000000000003'::uuid, 'manual');

  RAISE NOTICE 'CREW after fold: %',
    (SELECT format('affil rows=%s to_date=%s role=%s pointer=%s',
                   count(*), max(a.to_date)::text, max(a.role_at_firm),
                   max(sc.company_id::text))
       FROM public.studio_person_affiliations a
       JOIN public.studio_contacts sc ON sc.id = a.person_id
      WHERE a.person_id = v_other);
  RAISE NOTICE 'SURVIVOR after fold: %',
    (SELECT format('company_name=%s company_id=%s', company_name, company_id)
       FROM public.studio_contacts WHERE id='d0e10000-0000-0000-0000-000000000011');
END $$;
ROLLBACK;
