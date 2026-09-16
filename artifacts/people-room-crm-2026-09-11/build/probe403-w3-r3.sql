-- W3 round-3 adversarial probe, part 4: assert_party_bid_quoted_by() on a
-- studio-less project (R-BD's live population). ROLLBACKed. Local only.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- STUDIO B: a second design studio the designer of record also belongs to,
-- with its own member (a0…0007) and its own rolodex card.
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fd000000-0000-4000-8000-00000000000b','design_studio','P403 Other Studio','p403-b','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fd000000-0000-4000-8000-00000000000b','member','active',now()),
  ('a0000000-0000-0000-0000-000000000007','fd000000-0000-4000-8000-00000000000b','admin','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, status='active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by) VALUES
  ('fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-00000000000b','person','sub',
   'Estimator At The Other Studio','a0000000-0000-0000-0000-000000000007');

-- The seeded "Aspen Loft Refresh" is one of the FIVE projects 00628 leaves
-- studio_id IS NULL (its designer of record holds several memberships).
-- One seat on it, written by postgres so no guard is in question yet.
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, created_by)
VALUES ('fd200000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-0000000000d1',
        'sub','Rivera Finishes','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE v uuid; v_studio uuid;
BEGIN
  SELECT studio_id INTO v_studio FROM public.projects WHERE id='b0000000-0000-0000-0000-0000000000d1';
  RAISE NOTICE 'J the project records studio_id = % (NULL is R-BD''s legacy population)', v_studio;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
  RAISE NOTICE 'J project_tenant_org() answers % for a member of the OTHER studio',
    public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1');
  RAISE NOTICE 'J project_recorded_studio() answers %',
    public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1');

  BEGIN
    UPDATE public.project_parties
       SET bid_outcome = 'quoted',
           bid_quoted_by_person_id = 'fd100000-0000-4000-8000-000000000001'
     WHERE id = 'fd200000-0000-4000-8000-000000000001';
    RAISE NOTICE 'J a member of the OTHER studio wrote its own card onto this seat: ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'J REFUSED -> %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();

  SELECT bid_quoted_by_person_id INTO v FROM public.project_parties
   WHERE id='fd200000-0000-4000-8000-000000000001';
  RAISE NOTICE 'J the seat now names card % (org %)', v,
    (SELECT organization_id FROM public.studio_contacts WHERE id = v);

  -- The negative control: the SAME write against studio_contact_id, which
  -- 00624 checks against project_recorded_studio().
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
  BEGIN
    UPDATE public.project_parties
       SET studio_contact_id = 'fd100000-0000-4000-8000-000000000001'
     WHERE id = 'fd200000-0000-4000-8000-000000000001';
    RAISE NOTICE 'J control: studio_contact_id ACCEPTED (it should not be)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'J control: studio_contact_id REFUSED -> %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
