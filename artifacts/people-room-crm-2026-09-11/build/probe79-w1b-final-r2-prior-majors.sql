BEGIN;
\echo '=== r1 MAJOR-1: a CLOSED window must not mint a dead token nor revoke the live one ==='
DO $$
DECLARE v_seat uuid; v_proj uuid; v_old uuid; v_id uuid; v_tok text; v_exp timestamptz; v_oldstat text; v_active int;
BEGIN
  SELECT pp.id, pp.project_id INTO v_seat, v_proj FROM public.project_parties pp
   JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.name='Lindqvist kitchen' AND pp.display_name='Dana Kowalski';
  UPDATE public.project_parties SET on_site_to = CURRENT_DATE - 40, warranty_until = CURRENT_DATE - 30 WHERE id=v_seat;
  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (v_seat, v_proj, repeat('b',64), now() + interval '30 days', 'active') RETURNING id INTO v_old;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
  SELECT id, token INTO v_id, v_tok FROM public.create_field_link(v_seat);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  SELECT status INTO v_oldstat FROM public.field_link_tokens WHERE id=v_old;
  SELECT count(*) INTO v_active FROM public.field_link_tokens WHERE party_id=v_seat AND status='active' AND expires_at>now();
  RAISE NOTICE 'closed window (-40d/-30d): minted expiry % (dead: %) · prior token now % · live tokens on the seat: %',
    v_exp::date, (v_exp <= now()), v_oldstat, v_active;
END $$;

\echo ''
\echo '=== r1 MAJOR-2: does any Directory row claim a seat count it cannot nest? (mixed kinds) ==='
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
END $$;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, stage, updated_at) VALUES
 ('ffff6666-0000-4000-8000-00000000ca01',(SELECT id FROM public.projects WHERE name='Lindqvist kitchen'),'sub','Mixed Kind Human','+16125556001','+16125556001','warranty', now()-interval '9 days'),
 ('ffff6666-0000-4000-8000-00000000ca02',(SELECT id FROM public.projects WHERE name='Okonkwo residence'),'vendor','Mixed Kind Human','+16125556001','+16125556001','active', now());
SET LOCAL ROLE authenticated;
SELECT d.display_name, d.role, d.seat_count AS claims,
       (SELECT count(*) FROM public.people_directory_seats s WHERE s.person_id=d.person_id) AS nests
  FROM public.people_directory d WHERE d.display_name='Mixed Kind Human';
RESET ROLE;

\echo ''
\echo '=== r1 MAJOR-3: a gateless lapse changes nothing; a gated one does ==='
DO $$
DECLARE v_org uuid; v_firm uuid; v_d uuid;
BEGIN
  INSERT INTO public.organizations (id,type,name,slug,status) VALUES (gen_random_uuid(),'design_studio','P3','p3-'||substr(gen_random_uuid()::text,1,8),'active') RETURNING id INTO v_org;
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, company_name) VALUES (v_org,'company','sub','Gateless') RETURNING id INTO v_firm;
  INSERT INTO public.studio_compliance_documents (organization_id,holder_type,holder_id,doc_type,doc_label,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'other_named','training card',CURRENT_DATE-1,ARRAY[]::text[]) RETURNING id INTO v_d;
  RAISE NOTICE 'gateless lapse: % ', public.compliance_state(v_firm);
  UPDATE public.studio_compliance_documents SET blocks=ARRAY['site_access'] WHERE id=v_d;
  RAISE NOTICE 'same paper, one gate: %', public.compliance_state(v_firm);
END $$;

\echo ''
\echo '=== r1 MAJOR-4: a W-9 may not renew a COI; a shorter-dated COI may not either ==='
DO $$
DECLARE v_org uuid; v_firm uuid; v_coi uuid; v_w9 uuid; v_short uuid;
BEGIN
  INSERT INTO public.organizations (id,type,name,slug,status) VALUES (gen_random_uuid(),'design_studio','P4','p4-'||substr(gen_random_uuid()::text,1,8),'active') RETURNING id INTO v_org;
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, company_name) VALUES (v_org,'company','sub','Launder Co') RETURNING id INTO v_firm;
  INSERT INTO public.studio_compliance_documents (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE-10,ARRAY['site_access']) RETURNING id INTO v_coi;
  INSERT INTO public.studio_compliance_documents (organization_id,holder_type,holder_id,doc_type) VALUES (v_org,'company',v_firm,'w9') RETURNING id INTO v_w9;
  INSERT INTO public.studio_compliance_documents (organization_id,holder_type,holder_id,doc_type,expires_on,blocks)
  VALUES (v_org,'company',v_firm,'coi_gl',CURRENT_DATE-20,ARRAY['site_access']) RETURNING id INTO v_short;
  BEGIN UPDATE public.studio_compliance_documents SET superseded_by=v_w9 WHERE id=v_coi;
        RAISE NOTICE 'W-9 renewing a COI: ACCEPTED (hole)';
  EXCEPTION WHEN others THEN RAISE NOTICE 'W-9 renewing a COI: refused %', SQLERRM; END;
  BEGIN UPDATE public.studio_compliance_documents SET superseded_by=v_short WHERE id=v_coi;
        RAISE NOTICE 'shorter-dated COI renewing a COI: ACCEPTED (hole)';
  EXCEPTION WHEN others THEN RAISE NOTICE 'shorter-dated COI renewing a COI: refused %', SQLERRM; END;
END $$;
ROLLBACK;
