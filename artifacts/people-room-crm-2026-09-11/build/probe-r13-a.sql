-- r13 probe A: a seat stamped with a card of ANOTHER studio aborts the merge
-- with assert_project_party_cards()' raw token, which the r11/r12 pre-check
-- does not reach (both resolvers answer non-NULL).
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fa000000-0000-4000-8000-00000000000a','design_studio','R13 Studio A','r13-a','active'),
  ('fa000000-0000-4000-8000-00000000000c','design_studio','R13 Studio C','r13-c','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fa000000-0000-4000-8000-00000000000a','owner','active', now()),
  ('a0000000-0000-0000-0000-000000000007','fa000000-0000-4000-8000-00000000000c','owner','active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status='active';

-- two duplicate cards in studio A
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, created_by, created_at) VALUES
  ('fa100000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','person','sub','R13 Survivor','(612) 555-0931','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('fa100000-0000-4000-8000-00000000000b','fa000000-0000-4000-8000-00000000000a','person','sub','R13 Duplicate','(612) 555-0931','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- a job that RECORDS studio C
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  ('fa300000-0000-4000-8000-00000000000c','R13 other-studio job','a0000000-0000-0000-0000-000000000007','fa000000-0000-4000-8000-00000000000c','active','a0000000-0000-0000-0000-000000000007','full');

-- the legacy row 00624's guard refuses on every write but cannot undo:
-- studio A's card stamped on studio C's job
ALTER TABLE public.project_parties DISABLE TRIGGER assert_project_party_cards_trg;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, studio_contact_id, created_by) VALUES
  ('fa400000-0000-4000-8000-00000000000a','fa300000-0000-4000-8000-00000000000c','sub','R13 Duplicate','fa100000-0000-4000-8000-00000000000b','a0000000-0000-0000-0000-000000000004');
ALTER TABLE public.project_parties ENABLE TRIGGER assert_project_party_cards_trg;

DO $$
DECLARE v_t uuid; v_r uuid; v_id uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT public.project_tenant_org('fa300000-0000-4000-8000-00000000000c'),
         public.project_recorded_studio('fa300000-0000-4000-8000-00000000000c')
    INTO v_t, v_r;
  RAISE NOTICE 'A. resolvers: tenant=% recorded=%  (both non-NULL => pre-check finds nothing)', v_t, v_r;
  BEGIN
    v_id := public.merge_studio_contacts('fa100000-0000-4000-8000-00000000000a','fa100000-0000-4000-8000-00000000000b','phone');
    RAISE NOTICE 'A. MERGE SUCCEEDED -> %', v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'A. MERGE REFUSED -> %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK;
