-- r12 fix round — negative controls for MAJOR-2 (00629's studio-less pre-check).
-- Local database only. One transaction, ROLLBACKed. Probes objects, not the ledger.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;

-- 11j's shape: a studio-less job whose designer (a0…0003) is an active
-- co-member of a design studio the caller (a0…0004) also belongs to.
ALTER TABLE public.projects DISABLE TRIGGER set_project_studio_id;
INSERT INTO public.projects
  (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  ('f9300000-0000-4000-8000-0000000000c9','R12 control studioless job',
   'a0000000-0000-0000-0000-000000000003', NULL,'active',
   'a0000000-0000-0000-0000-000000000003','full');
ALTER TABLE public.projects ENABLE TRIGGER set_project_studio_id;

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, created_by, created_at) VALUES
  ('f9f50000-0000-4000-8000-0000000000c1','b0000000-0000-0000-0000-000000000001','person','sub',
   'R12 Control Human','(612) 555-0941','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('f9f50000-0000-4000-8000-0000000000c2','b0000000-0000-0000-0000-000000000001','person','sub',
   'R12 Control Human','(612) 555-0941','a0000000-0000-0000-0000-000000000004','2026-01-01');

ALTER TABLE public.project_parties DISABLE TRIGGER assert_project_party_cards_trg;
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, studio_contact_id, created_by) VALUES
  ('f9f50000-0000-4000-8000-0000000000c3','f9300000-0000-4000-8000-0000000000c9','sub',
   'R12 Control Human','f9f50000-0000-4000-8000-0000000000c2',
   'a0000000-0000-0000-0000-000000000004');
ALTER TABLE public.project_parties ENABLE TRIGGER assert_project_party_cards_trg;

DO $$
DECLARE
  n_r11 integer; n_new integer; v_tenant uuid; v_recorded uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  v_tenant   := public.project_tenant_org('f9300000-0000-4000-8000-0000000000c9');
  v_recorded := public.project_recorded_studio('f9300000-0000-4000-8000-0000000000c9');
  RAISE NOTICE 'CONTROL resolvers: tenant_org=% recorded_studio=%',
    v_tenant, COALESCE(v_recorded::text, '<NULL>');

  -- A) r11's pre-check predicate, verbatim
  SELECT count(*) INTO n_r11
    FROM public.project_parties pp
   WHERE (pp.studio_contact_id = 'f9f50000-0000-4000-8000-0000000000c2'
          OR pp.company_id = 'f9f50000-0000-4000-8000-0000000000c2'
          OR pp.warranty_contact_person_id = 'f9f50000-0000-4000-8000-0000000000c2')
     AND public.project_tenant_org(pp.project_id) IS NULL;

  -- B) the shipped predicate
  SELECT count(*) INTO n_new
    FROM public.project_parties pp
   WHERE (
           (pp.studio_contact_id = 'f9f50000-0000-4000-8000-0000000000c2'
            AND (public.project_tenant_org(pp.project_id) IS NULL
                 OR public.project_recorded_studio(pp.project_id) IS NULL))
        OR ((pp.company_id = 'f9f50000-0000-4000-8000-0000000000c2'
             OR pp.warranty_contact_person_id = 'f9f50000-0000-4000-8000-0000000000c2')
            AND (public.project_tenant_org(pp.project_id) IS NULL
                 OR (pp.studio_contact_id IS NOT NULL
                     AND public.project_recorded_studio(pp.project_id) IS NULL)))
         );
  RAISE NOTICE 'CONTROL predicates: r11 finds % seat(s), shipped finds % seat(s)', n_r11, n_new;

  -- C) the write r11's pre-check let through
  BEGIN
    UPDATE public.project_parties
       SET studio_contact_id = 'f9f50000-0000-4000-8000-0000000000c1'
     WHERE id = 'f9f50000-0000-4000-8000-0000000000c3';
    RAISE NOTICE 'CONTROL seat repoint: ACCEPTED (no guard leg fired)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CONTROL seat repoint: REFUSED -> %', SQLERRM;
  END;

  -- D) the shipped RPC on the same pair
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9f50000-0000-4000-8000-0000000000c1','f9f50000-0000-4000-8000-0000000000c2','phone');
    RAISE NOTICE 'CONTROL merge: WENT THROUGH';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CONTROL merge: REFUSED -> %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
