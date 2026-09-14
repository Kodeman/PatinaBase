\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org uuid; v_designer uuid; v_uid uuid; v_proj uuid; v_card uuid; v_hh uuid;
  v_seat uuid; v_auth uuid;
BEGIN
  SELECT p.studio_id, p.designer_id INTO v_org, v_designer
    FROM public.projects p WHERE p.studio_id IS NOT NULL LIMIT 1;
  SELECT p.id INTO v_proj FROM public.projects p WHERE p.studio_id = v_org LIMIT 1;
  SELECT om.user_id INTO v_uid FROM public.organization_members om
   WHERE om.organization_id=v_org AND om.status='active' AND om.role IN ('owner','admin') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid,'role','authenticated')::text, true);

  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
  VALUES (v_org,'person','client','Chidi Probe', v_uid) RETURNING id INTO v_card;

  -- the seat already exists, with a money grant sourced from the AGREEMENT
  INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id, created_by)
  VALUES (v_proj, 'client_rep', 'Chidi Probe', v_card, v_uid) RETURNING id INTO v_seat;

  INSERT INTO public.project_party_authority
    (engagement_id, scope, threshold_cents, source_clause, granted_by)
  VALUES (v_seat, 'money', 1000000, 'Agreement clause 7', v_uid) RETURNING id INTO v_auth;

  RAISE NOTICE 'BEFORE: %', (SELECT format('%s cents, source=%s', threshold_cents, source_clause)
                               FROM public.project_party_authority WHERE id=v_auth);

  INSERT INTO public.client_households (organization_id, designer_id, display_name, co_threshold_cents, created_by)
  VALUES (v_org, v_designer, 'The Probes', 250000, v_uid) RETURNING id INTO v_hh;

  PERFORM public.add_household_member(v_hh, v_card, 'client_rep', v_proj);

  RAISE NOTICE 'AFTER : %', (SELECT format('%s cents, source=%s, effective_to=%s', threshold_cents, source_clause, effective_to)
                               FROM public.project_party_authority WHERE id=v_auth);
  RAISE NOTICE 'open money rows on the seat: %',
    (SELECT count(*) FROM public.project_party_authority
      WHERE engagement_id=v_seat AND scope='money' AND effective_to IS NULL);
  RAISE NOTICE 'seats created: % (reused=%)', (SELECT count(*) FROM public.project_parties WHERE studio_contact_id=v_card),
    (SELECT count(*)=1 FROM public.project_parties WHERE studio_contact_id=v_card);
END $$;
ROLLBACK;
